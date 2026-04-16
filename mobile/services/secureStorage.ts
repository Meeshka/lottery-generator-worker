import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const ID_NUMBER_KEY = 'idNumber';
const PHONE_NUMBER_KEY = 'phoneNumber';
const AUTH_PROFILE_KEY = 'authProfile';

export interface StoredAuthProfile {
  lottoUserId: string;
  idNumber: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  role: "admin" | "user";
  iat: number | null;
  exp: number | null;
}

export async function saveTokens(accessToken: string, refreshToken: string) {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  } catch (error) {
    // console.error('Error saving tokens:', error);
    throw error;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch (error) {
    // console.error('Error getting access token:', error);
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    // console.error('Error getting refresh token:', error);
    return null;
  }
}

export async function clearTokens() {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    // console.error('Error clearing tokens:', error);
    throw error;
  }
}

export async function saveAuthProfile(profile: StoredAuthProfile) {
  try {
    await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    // console.error('Error saving auth profile:', error);
    throw error;
  }
}

export async function getAuthProfile(): Promise<StoredAuthProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuthProfile) : null;
  } catch (error) {
    // console.error('Error getting auth profile:', error);
    return null;
  }
}

export async function clearAuthProfile() {
  try {
    await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
  } catch (error) {
    // console.error('Error clearing auth profile:', error);
    throw error;
  }
}

export async function saveUserCredentials(idNumber: string, phoneNumber: string) {
  try {
    await AsyncStorage.setItem(ID_NUMBER_KEY, idNumber);
    await AsyncStorage.setItem(PHONE_NUMBER_KEY, phoneNumber);
  } catch (error) {
    // console.error('Error saving user credentials:', error);
    throw error;
  }
}

export async function getUserCredentials(): Promise<{ idNumber: string | null; phoneNumber: string | null }> {
  try {
    const idNumber = await AsyncStorage.getItem(ID_NUMBER_KEY);
    const phoneNumber = await AsyncStorage.getItem(PHONE_NUMBER_KEY);
    return { idNumber, phoneNumber };
  } catch (error) {
    // console.error('Error getting user credentials:', error);
    return { idNumber: null, phoneNumber: null };
  }
}

export async function clearUserCredentials() {
  try {
    await AsyncStorage.removeItem(ID_NUMBER_KEY);
    await AsyncStorage.removeItem(PHONE_NUMBER_KEY);
  } catch (error) {
    // console.error('Error clearing user credentials:', error);
    throw error;
  }
}
