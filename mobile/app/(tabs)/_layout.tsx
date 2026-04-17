import Drawer from 'expo-router/drawer';
import { DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getAuthProfile, clearTokens, clearAuthProfile, getAccessToken } from '../../services/secureStorage';
import { validateToken } from '../../services/api';

function CustomDrawerContent(props: any) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadUserProfile();
  }, []);

  async function loadUserProfile() {
    try {
      const token = await getAccessToken();
      if (!token || !validateToken(token)) {
        router.replace('/login');
        return;
      }

      const profile = await getAuthProfile();
      setIsAdmin(!!profile?.isAdmin);
      setUsername(profile?.firstName || profile?.email || 'User');
    } catch (err) {
      console.error('Error loading user profile:', err);
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await clearTokens();
      await clearAuthProfile();
      router.replace('/login');
    } catch (err) {
      console.error('Error logging out:', err);
    }
  }

  return (
    <View style={styles.drawerContainer}>
      <View style={styles.drawerHeader}>
        <Text style={styles.appName}>Lotto</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <>
            <Text style={styles.username}>{username}</Text>
            <View style={[
              styles.roleBadge,
              isAdmin ? styles.adminBadge : styles.userBadge
            ]}>
              <Text style={styles.roleText}>{isAdmin ? 'Admin' : 'User'}</Text>
            </View>
          </>
        )}
      </View>

      <DrawerContentScrollView {...props}>
        <DrawerItemList {...props} />
        
        {isAdmin && (
          <DrawerItem
            label="Admin Actions"
            onPress={() => props.navigation.navigate('admin')}
          />
        )}
      </DrawerContentScrollView>

      <View style={styles.drawerFooter}>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#007AFF',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
      drawerContent={(props) => <CustomDrawerContent {...props} />}
    >
      <Drawer.Screen
        name="home"
        options={{ title: 'Home' }}
      />
      <Drawer.Screen
        name="generate"
        options={{ title: 'Generate' }}
      />
      <Drawer.Screen
        name="batches"
        options={{ title: 'Batches' }}
      />
      <Drawer.Screen
        name="info"
        options={{ title: 'Info' }}
      />
      <Drawer.Screen
        name="admin"
        options={{ title: 'Admin Actions' }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  drawerHeader: {
    padding: 20,
    backgroundColor: '#007AFF',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  adminBadge: {
    backgroundColor: '#9C27B0',
  },
  userBadge: {
    backgroundColor: '#4CAF50',
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  drawerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
