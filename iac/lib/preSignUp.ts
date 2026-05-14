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
        
        // Cognito requires the ProviderName to match exactly (e.g. "Google" instead of "google")
        const formattedProviderName = providerName.charAt(0).toUpperCase() + providerName.slice(1);

        const linkCommand = new AdminLinkProviderForUserCommand({
            UserPoolId: userPoolId,
            DestinationUser: {
                ProviderName: 'Cognito',
                // ProviderAttributeName is not needed for the Cognito destination user
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
    return event;
};
