import { Amplify } from 'aws-amplify'

let configured = false

export function configureAmplify() {
    if (configured) return

    const userPoolId  = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!
    const userPoolClientId    = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!
    const domain      = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!
    const redirectSignIn  = process.env.NEXT_PUBLIC_REDIRECT_URI!
    const redirectSignOut = process.env.NEXT_PUBLIC_REDIRECT_SIGN_OUT_URI
      ?? redirectSignIn.replace('/auth/callback', '/')

    Amplify.configure({
        Auth: {
            Cognito: {
                userPoolId,
                userPoolClientId,
                loginWith: {
                    email: true,
                    oauth: {
                        domain,
                        scopes: ['email', 'openid', 'profile'],
                        redirectSignIn:  [redirectSignIn],
                        redirectSignOut: [redirectSignOut],
                        responseType: 'code',
                    },
                },
            },
        },
    })

    configured = true
}