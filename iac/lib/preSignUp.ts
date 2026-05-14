import { CognitoIdentityProviderClient, ListUsersCommand, AdminLinkProviderForUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});

export const handler = async (event: any) => {
    // Only process external provider sign-ups (e.g. Google)
    if (event.triggerSource !== "PreSignUp_ExternalProvider") {
        return event;
    }


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

    const nativeUser = listUsersResponse.Users?.find(
        (user) => user.UserStatus !== 'EXTERNAL_PROVIDER'
    );

    if (nativeUser && nativeUser.Username) {
        const [providerName, ...providerUserIdParts] = event.userName.split('_');
        const providerUserId = providerUserIdParts.join('_');

        const linkCommand = new AdminLinkProviderForUserCommand({
            UserPoolId: userPoolId,
            DestinationUser: {
                ProviderName: 'Cognito',
                ProviderAttributeName: 'cognito:username',
                ProviderAttributeValue: nativeUser.Username,
            },
            SourceUser: {
                ProviderName: providerName,
                ProviderAttributeName: 'Cognito_Subject',
                ProviderAttributeValue: providerUserId,
            },
        });

        await client.send(linkCommand);
    }
    return event;
};
