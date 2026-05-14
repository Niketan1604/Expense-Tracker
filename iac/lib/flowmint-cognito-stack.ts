import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
interface CognitoStackProps extends StackProps {
    appName: string;
    envName: string;
    cloudfrontDomain: string;
    googleClientId: string;
    googleClientSecret: string;
}

export class FlowmintCognitoStack extends Stack {
    constructor(scope: Construct, id: string, props: CognitoStackProps) {
        super(scope, id, props);
        const { appName, envName, cloudfrontDomain, googleClientId, googleClientSecret } = props;

        const exportParam = (name: string, value: string) => {
            new ssm.StringParameter(this, `SSMParam-${name}`, {
                parameterName: `/${appName}/${envName}/cognito/${name}`,
                stringValue: value,
                description: `${appName} ${envName} cognito — ${name}`
            });
        };

        const preSignUpTrigger = new lambdaNodejs.NodejsFunction(this, 'PreSignUpTrigger', {
            entry: path.join(__dirname, 'preSignUp.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
        });

        const userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: `${appName}-${envName}-user-pool`,
            lambdaTriggers: {
                preSignUp: preSignUpTrigger,
            },

            signInCaseSensitive: false, // Usernames should not be case sensitive (eg - username can be email id, and email ids are not case sensitive).
            selfSignUpEnabled: true, // Allow users to sign up themselves
            userVerification: {
                emailStyle: cognito.VerificationEmailStyle.CODE, // Send verification code in email
                emailBody: `Thanks for signing up to our ${appName} app! Your verification code is {####}`, // Email body with placeholder for verification code
                emailSubject: `Verify your email for ${appName} app!`, // Email subject
            },
            signInAliases: {
                email: true, // Allow users to sign in with their email address
            },
            autoVerify: {
                email: true, // Automatically verify email addresses
            },
            keepOriginal: {
                email: true, // Keep the original email address as the username
            },
            standardAttributes: {
                email: {
                    required: true, // Make email a required attribute
                    mutable: true, // allow users to change their email address
                },
                fullname: {
                    required: false, // Full name is not a required attribute
                    mutable: true, // allow users to change their full name
                },
                gender: {
                    required: false,
                    mutable: true, // allow users to change their gender
                },
                birthdate: {
                    required: false,
                    mutable: true, // allow users to change their birthdate
                },
            },
            passwordPolicy: {
                minLength: 8,
                requireDigits: true,
                requireLowercase: true,
                requireSymbols: true,
                requireUppercase: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, // Allow users to recover their account using their email address
            email: cognito.UserPoolEmail.withCognito(), // Use Cognito's built-in email functionality to send verification and recovery emails
            deletionProtection: envName === 'prod', // Enable deletion protection to prevent accidental deletion of the user pool in prod env only

        });

        preSignUpTrigger.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'cognito-idp:ListUsers',
                'cognito-idp:AdminLinkProviderForUser'
            ],
            resources: [userPool.userPoolArn]
        }));

        const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool,
            generateSecret: false, // Do not generate a client secret for the user pool client
            accessTokenValidity: Duration.minutes(30), // Access token is valid for 30 minutes
            authSessionValidity: Duration.minutes(3), // Auth session is valid for 3 minutes
            idTokenValidity: Duration.minutes(30), // ID token is valid for 30 minutes
            refreshTokenValidity: Duration.days(30), // Refresh token is valid for 30 days
            userPoolClientName: `${appName}-${envName}-client`,
            enableTokenRevocation: true, // Enable token revocation to allow users to sign out from all devices
            preventUserExistenceErrors: true, // Prevent user existence errors to enhance security
            authFlows: {
                userSrp: true, // Enable Secure Remote Password (SRP) authentication flow
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true, // Enable authorization code grant flow for social login
                },
                callbackUrls: [
                    `https://${cloudfrontDomain}/`,
                    `https://${cloudfrontDomain}/auth/callback`,
                    `http://localhost:3000`, // Callback URL for local development
                    `http://localhost:3000/auth/callback`, // Callback URL for local development with auth callback path
                ],
                logoutUrls: [
                    `https://${cloudfrontDomain}/`,
                    `http://localhost:3000/`, // Logout URL for local development
                ],
                scopes: [
                    cognito.OAuthScope.EMAIL, // Request access to the user's email
                    cognito.OAuthScope.OPENID, // Request access to the user's openid
                    cognito.OAuthScope.PROFILE, // Request access to the user's profile
                ],

            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO, // Enable Cognito user pool as an identity provider for the client
                cognito.UserPoolClientIdentityProvider.GOOGLE, // Enable Google as an identity provider for the client
            ],
        });

        const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
            userPool,
            cognitoDomain: {
                domainPrefix: `${appName}-${envName}`,
            },
        });

        const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
            userPool,
            clientId: googleClientId,
            clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
            scopes: ['profile', 'email', 'openid'],
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                fullname: cognito.ProviderAttribute.GOOGLE_NAME,
            }
        });

        userPoolClient.node.addDependency(googleProvider);
        exportParam('user-pool-id', userPool.userPoolId);
        exportParam('app-client-id', userPoolClient.userPoolClientId);
        exportParam('issuer-url', userPool.userPoolProviderUrl);
        exportParam('hosted-domain', userPoolDomain.baseUrl().replace('https://', ''));
    }
}
