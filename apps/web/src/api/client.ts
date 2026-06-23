// Centralized fetch wrapper to ensure mock auth header is always present

const BASE_URL = "http://localhost:3000/api";
const MOCK_USER_ID = "dev-user-1";

export const apiClient = async (
  endpoint: string,
  options: RequestInit = {},
) => {
  const headers = {
    "Content-Type": "application/json",
    "x-tester-id": MOCK_USER_ID,
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! stats ${response.status}`);
  }

  return response.json();
};
