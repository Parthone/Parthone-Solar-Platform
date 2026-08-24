import { initializeApp } from 'firebase-admin/app'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

initializeApp()

export const platformHealth = onCall((request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  return { ok: true, uid: request.auth.uid }
})
