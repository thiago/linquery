import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, SafeAreaView } from 'react-native';
import { runTests } from './tests/SQLiteAdapter.test';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export default function App() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    runTests()
      .then(setResults)
      .finally(() => setRunning(false));
  }, []);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Linquery E2E Tests</Text>
        <Text style={styles.subtitle}>expo-sqlite</Text>
        {running && <Text>Running tests...</Text>}
        {!running && (
          <Text style={styles.summary}>
            {passed} passed, {failed} failed
          </Text>
        )}
      </View>

      <ScrollView style={styles.results}>
        {results.map((result, index) => (
          <View
            key={index}
            style={[
              styles.testResult,
              result.passed ? styles.passed : styles.failed,
            ]}
          >
            <Text style={styles.testName}>
              {result.passed ? '✓' : '✗'} {result.name}
            </Text>
            {result.error && (
              <Text style={styles.error}>{result.error}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  summary: {
    marginTop: 8,
    fontSize: 14,
  },
  results: {
    flex: 1,
  },
  testResult: {
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 4,
  },
  passed: {
    backgroundColor: '#d4edda',
  },
  failed: {
    backgroundColor: '#f8d7da',
  },
  testName: {
    fontSize: 14,
    fontWeight: '500',
  },
  error: {
    marginTop: 4,
    fontSize: 12,
    color: '#721c24',
  },
});
