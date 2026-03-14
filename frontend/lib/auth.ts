import {
  signIn, signOut, signUp, confirmSignUp,
  getCurrentUser, fetchAuthSession, resendSignUpCode,
} from 'aws-amplify/auth'

export const authSignUp = (email: string, password: string, name: string) =>
  signUp({
    username: email,
    password,
    options: { userAttributes: { email, name } },
  })

export const authConfirmSignUp = (email: string, code: string) =>
  confirmSignUp({ username: email, confirmationCode: code })

export const authResendCode = (email: string) =>
  resendSignUpCode({ username: email })

export const authSignIn = (email: string, password: string) =>
  signIn({ username: email, password })

export const authSignOut = () => signOut()

export const getAuthUser = () => getCurrentUser()

export async function getIdToken(): Promise<string> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) throw new Error('No active session')
  return token
}
