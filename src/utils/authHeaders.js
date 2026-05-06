import { auth } from "../firebaseConfig";

export async function getAuthHeaders() {
  const currentUser = auth.currentUser;
  if (!currentUser) return {};

  const token = await currentUser.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}
