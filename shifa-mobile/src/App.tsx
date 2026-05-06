import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import ClinicScreen from './screens/ClinicScreen';
import GuardScreen from './screens/GuardScreen';
import SettingsScreen from './screens/SettingsScreen';
import { initDatabase } from './db/sqlite';
import { flushSMSQueue } from './services/alertSMS';

const Tab = createBottomTabNavigator();

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initDatabase();
        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize database:', error);
        setLoading(false);
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.type !== 'none') {
        void flushSMSQueue();
      }
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Initializing SHIFA...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: true,
          tabBarStyle: styles.tabBar,
          headerStyle: styles.header,
          headerTintColor: '#F0F6FC',
          headerTitleStyle: styles.headerTitle,
        }}
      >
        <Tab.Screen
          name="Clinic"
          component={ClinicScreen}
          options={{
            title: 'SHIFA Clinic',
            tabBarLabel: 'Consult',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🩺</Text>,
          }}
        />
        <Tab.Screen
          name="Guard"
          component={GuardScreen}
          options={{
            title: 'SHIFA Guard',
            tabBarLabel: 'Guard',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🛡️</Text>,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D1117',
  },
  loadingText: {
    color: '#F0F6FC',
    marginTop: 10,
    fontSize: 16,
  },
  tabBar: {
    backgroundColor: '#161B22',
    borderTopColor: '#30363D',
  },
  header: {
    backgroundColor: '#0D1117',
    borderBottomColor: '#30363D',
  },
  headerTitle: {
    color: '#F0F6FC',
    fontSize: 18,
    fontWeight: '600',
  },
});
