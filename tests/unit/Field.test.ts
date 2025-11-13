/**
 * Tests for Field classes
 */

import { describe, it, expect } from 'vitest';
import {
  CharField,
  TextField,
  IntegerField,
  FloatField,
  BooleanField,
  DateTimeField,
  DateField,
  JSONField,
  ChoiceField,
} from '../../src/core/Field';
import { FieldValidationError } from '../../src/core/errors';

describe('CharField', () => {
  it('should create CharField with default options', () => {
    const field = new CharField();
    expect(field.getType()).toBe('string');
    expect(field.required).toBe(true);
  });

  it('should validate string values', async () => {
    const field = new CharField({ maxLength: 10 });
    await expect(field.validate('hello', 'name')).resolves.toBeUndefined();
  });

  it('should fail validation for non-string', async () => {
    const field = new CharField();
    await expect(field.validate(123 as any, 'name')).rejects.toThrow(FieldValidationError);
  });

  it('should validate maxLength', async () => {
    const field = new CharField({ maxLength: 5 });
    await expect(field.validate('hello', 'name')).resolves.toBeUndefined();
    await expect(field.validate('hello world', 'name')).rejects.toThrow('Maximum length');
  });

  it('should validate minLength', async () => {
    const field = new CharField({ minLength: 3 });
    await expect(field.validate('hi', 'name')).rejects.toThrow('Minimum length');
    await expect(field.validate('hello', 'name')).resolves.toBeUndefined();
  });

  it('should handle required option', async () => {
    const required = new CharField({ required: true });
    const optional = new CharField({ required: false });

    await expect(required.validate(null as any, 'name')).rejects.toThrow('required');
    await expect(optional.validate(null as any, 'name')).resolves.toBeUndefined();
  });

  it('should get default value', () => {
    const field1 = new CharField({ default: 'test' });
    expect(field1.getDefault()).toBe('test');

    const field2 = new CharField({ default: () => 'dynamic' });
    expect(field2.getDefault()).toBe('dynamic');
  });
});

describe('TextField', () => {
  it('should create TextField', () => {
    const field = new TextField();
    expect(field.getType()).toBe('text');
  });

  it('should handle long text', async () => {
    const field = new TextField();
    const longText = 'a'.repeat(10000);
    await expect(field.validate(longText, 'content')).resolves.toBeUndefined();
  });
});

describe('IntegerField', () => {
  it('should validate integers', async () => {
    const field = new IntegerField();
    await expect(field.validate(42, 'age')).resolves.toBeUndefined();
  });

  it('should reject floats', async () => {
    const field = new IntegerField();
    await expect(field.validate(42.5, 'age')).rejects.toThrow('integer');
  });

  it('should validate min/max', async () => {
    const field = new IntegerField({ min: 0, max: 100 });

    await expect(field.validate(-1, 'age')).rejects.toThrow('at least 0');
    await expect(field.validate(101, 'age')).rejects.toThrow('at most 100');
    await expect(field.validate(50, 'age')).resolves.toBeUndefined();
  });
});

describe('FloatField', () => {
  it('should validate floats', async () => {
    const field = new FloatField();
    await expect(field.validate(42.5, 'price')).resolves.toBeUndefined();
    await expect(field.validate(42, 'price')).resolves.toBeUndefined();
  });

  it('should handle precision', () => {
    const field = new FloatField({ precision: 2 });
    expect(field.toDB(42.556)).toBe(42.56);
    expect(field.toDB(42.554)).toBe(42.55);
    expect(field.toDB(42.12345)).toBe(42.12);
  });

  it('should validate min/max', async () => {
    const field = new FloatField({ min: 0.0, max: 100.0 });

    await expect(field.validate(-0.1, 'value')).rejects.toThrow('at least 0');
    await expect(field.validate(100.1, 'value')).rejects.toThrow('at most 100');
    await expect(field.validate(50.5, 'value')).resolves.toBeUndefined();
  });
});

describe('BooleanField', () => {
  it('should validate booleans', async () => {
    const field = new BooleanField();
    await expect(field.validate(true, 'active')).resolves.toBeUndefined();
    await expect(field.validate(false, 'active')).resolves.toBeUndefined();
  });

  it('should reject non-booleans', async () => {
    const field = new BooleanField();
    await expect(field.validate(1 as any, 'active')).rejects.toThrow('boolean');
    await expect(field.validate('true' as any, 'active')).rejects.toThrow('boolean');
  });
});

describe('DateTimeField', () => {
  it('should validate Date objects', async () => {
    const field = new DateTimeField();
    const now = new Date();
    await expect(field.validate(now, 'createdAt')).resolves.toBeUndefined();
  });

  it('should reject invalid dates', async () => {
    const field = new DateTimeField();
    const invalid = new Date('invalid');
    await expect(field.validate(invalid, 'createdAt')).rejects.toThrow('Invalid date');
  });

  it('should convert to ISO string', () => {
    const field = new DateTimeField();
    const date = new Date('2024-01-01T10:00:00Z');
    expect(field.toDB(date)).toBe('2024-01-01T10:00:00.000Z');
  });

  it('should convert from string', () => {
    const field = new DateTimeField();
    const result = field.fromDB('2024-01-01T10:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-01-01T10:00:00.000Z');
  });

  it('should handle autoNow and autoNowAdd', () => {
    const field1 = new DateTimeField({ autoNow: true });
    const field2 = new DateTimeField({ autoNowAdd: true });

    expect(field1.autoNow).toBe(true);
    expect(field1.required).toBe(false); // Auto fields can't be required

    expect(field2.autoNowAdd).toBe(true);
    expect(field2.required).toBe(false);
  });
});

describe('DateField', () => {
  it('should convert to date-only format', () => {
    const field = new DateField();
    const date = new Date('2024-01-15T10:30:00Z');
    expect(field.toDB(date)).toBe('2024-01-15');
  });
});

describe('JSONField', () => {
  it('should validate objects', async () => {
    const field = new JSONField();
    await expect(field.validate({ foo: 'bar' }, 'data')).resolves.toBeUndefined();
  });

  it('should validate arrays', async () => {
    const field = new JSONField();
    await expect(field.validate([1, 2, 3], 'data')).resolves.toBeUndefined();
  });

  it('should reject primitives', async () => {
    const field = new JSONField();
    await expect(field.validate('string' as any, 'data')).rejects.toThrow('object or array');
    await expect(field.validate(123 as any, 'data')).rejects.toThrow('object or array');
  });

  it('should serialize to JSON string', () => {
    const field = new JSONField();
    const obj = { foo: 'bar', num: 42 };
    expect(field.toDB(obj)).toBe('{"foo":"bar","num":42}');
  });

  it('should deserialize from JSON string', () => {
    const field = new JSONField();
    const result = field.fromDB('{"foo":"bar","num":42}');
    expect(result).toEqual({ foo: 'bar', num: 42 });
  });
});

describe('ChoiceField', () => {
  const ROLES = ['admin', 'user', 'guest'] as const;

  it('should validate choices', async () => {
    const field = new ChoiceField({ choices: ROLES });

    await expect(field.validate('admin', 'role')).resolves.toBeUndefined();
    await expect(field.validate('user', 'role')).resolves.toBeUndefined();
    await expect(field.validate('guest', 'role')).resolves.toBeUndefined();
  });

  it('should reject invalid choices', async () => {
    const field = new ChoiceField({ choices: ROLES });
    await expect(field.validate('invalid' as any, 'role')).rejects.toThrow('Must be one of');
  });

  it('should work with number choices', async () => {
    const field = new ChoiceField({ choices: [1, 2, 3] as const });

    await expect(field.validate(1, 'level')).resolves.toBeUndefined();
    await expect(field.validate(4 as any, 'level')).rejects.toThrow('Must be one of');
  });
});

describe('Field metadata', () => {
  it('should return metadata', () => {
    const field = new CharField({
      maxLength: 100,
      required: true,
      unique: true,
      helpText: 'User name',
    });

    const meta = field.getMetadata();

    expect(meta.type).toBe('string');
    expect(meta.required).toBe(true);
    expect(meta.unique).toBe(true);
    expect(meta.maxLength).toBe(100);
    expect(meta.helpText).toBe('User name');
  });
});

describe('Custom validators', () => {
  it('should run custom validators', async () => {
    const emailValidator = (value: string) => {
      if (!value.includes('@')) {
        throw new Error('Invalid email');
      }
    };

    const field = new CharField({
      validators: [emailValidator],
    });

    await expect(field.validate('test@example.com', 'email')).resolves.toBeUndefined();
    await expect(field.validate('invalid', 'email')).rejects.toThrow('Invalid email');
  });

  it('should run multiple validators', async () => {
    const minLength = (value: string) => {
      if (value.length < 8) throw new Error('Too short');
    };

    const hasNumber = (value: string) => {
      if (!/\d/.test(value)) throw new Error('Must contain number');
    };

    const field = new CharField({
      validators: [minLength, hasNumber],
    });

    await expect(field.validate('short', 'password')).rejects.toThrow('Too short');
    await expect(field.validate('longtext', 'password')).rejects.toThrow('Must contain number');
    await expect(field.validate('longtext123', 'password')).resolves.toBeUndefined();
  });
});
