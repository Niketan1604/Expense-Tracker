import { CognitoIdentityProviderClient, ListUsersCommand, AdminLinkProviderForUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});

export const handler = async (event: any) => {

    const userPoolId = event.userPoolId;
    const email = event.request.userAttributes.email;

    if (!email) {
        return event;
    }

    // Search for existing users with this email
    const listUsersResponse = await client.send(new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
    }));

    if (event.triggerSource === "PreSignUp_ExternalProvider") {
        const nativeUser = listUsersResponse.Users?.find(
            (user) => user.UserStatus !== 'EXTERNAL_PROVIDER'
        );

        if (nativeUser && nativeUser.Username) {
            const [providerName, ...providerUserIdParts] = event.userName.split('_');
            const providerUserId = providerUserIdParts.join('_');

            // Cognito requires the ProviderName to match exactly (e.g. "Google" instead of "google")
            const formattedProviderName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

            const linkCommand = new AdminLinkProviderForUserCommand({
                UserPoolId: userPoolId,
                DestinationUser: {
                    ProviderName: 'Cognito',
                    ProviderAttributeValue: nativeUser.Username,
                },
                SourceUser: {
                    ProviderName: formattedProviderName,
                    ProviderAttributeName: 'Cognito_Subject',
                    ProviderAttributeValue: providerUserId,
                },
            });

            await client.send(linkCommand);
        }
    } else if (event.triggerSource === "PreSignUp_SignUp") {
        // Normal email/password sign up
        // Check if there is an external user with this email
        const externalUser = listUsersResponse.Users?.find(
            (user) => user.UserStatus === 'EXTERNAL_PROVIDER'
        );

        if (externalUser) {
            // Throwing an error here prevents the sign up.
            // Cognito returns this error message to the client.
            throw new Error("An account with this email already exists. Please sign in with Google.");
        }
    }

    return event;
};
