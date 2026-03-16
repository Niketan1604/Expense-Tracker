import { Amplify } from 'aws-amplify'

let configured = false

export function configureAmplify() {
    if (configured) return

    Amplify.configure({
        Auth: {
            Cognito: {
                userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
                userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
                loginWith: {
                    email: true,
                    oauth: {
                        domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN!.replace('https://', ''),
                        scopes: ['email', 'openid', 'profile'],
                        redirectSignIn: [process.env.NEXT_PUBLIC_REDIRECT_URI!],
                        redirectSignOut: [process.env.NEXT_PUBLIC_REDIRECT_URI!.replace('/auth/callback', '')],
                        responseType: 'code',
                    },
                },
            },
        },
    })

    configured = true
}
