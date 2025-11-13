/**
 * Integration tests for signal system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Model, CharField, IntegerField, Manager, signals } from '../../src/core';
import { MemoryAdapter } from '../../src/adapters';

// Define test model
class TestModel extends Model {
  declare id?: number;
  declare name: string;
  declare count: number;
  static objects: Manager<TestModel>;
}

describe('Signal System', () => {
  let adapter: MemoryAdapter;
  const signalCalls: string[] = [];

  beforeEach(async () => {
    adapter = new MemoryAdapter();

    // Initialize TestModel
    TestModel.init({
      name: new CharField({ maxLength: 100 }),
      count: new IntegerField({ default: 0 }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (TestModel as any).setAdapter(adapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TestModel.objects = new Manager(TestModel as any, adapter);

    // Clear signal calls
    signalCalls.length = 0;

    // Clear all signal receivers
    signals.preInit.clear();
    signals.postInit.clear();
    signals.preSave.clear();
    signals.postSave.clear();
    signals.preDelete.clear();
    signals.postDelete.clear();
  });

  afterEach(() => {
    // Clean up signal receivers after each test
    signals.preInit.clear();
    signals.postInit.clear();
    signals.preSave.clear();
    signals.postSave.clear();
    signals.preDelete.clear();
    signals.postDelete.clear();
  });

  describe('Init Signals', () => {
    it('should emit pre_init and post_init signals', async () => {
      // Connect signal handlers
      signals.preInit.connect((sender, instance, kwargs) => {
        // pre_init receives the data in kwargs, not on the instance yet
        const data = kwargs?.data as any;
        signalCalls.push(`pre_init:${data?.name || 'undefined'}`);
      });

      signals.postInit.connect((sender, instance) => {
        signalCalls.push(`post_init:${(instance as any).name}`);
      });

      // Create instance
      const instance = new TestModel({ name: 'Test' });

      // Wait for async signals
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(signalCalls).toContain('pre_init:Test');
      expect(signalCalls).toContain('post_init:Test');
      expect(instance.name).toBe('Test');
    });

    it('should pass correct sender to init signals', async () => {
      let receivedSender: unknown;

      signals.postInit.connect((sender) => {
        receivedSender = sender;
      });

      new TestModel({ name: 'Test' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedSender).toBe(TestModel);
    });
  });

  describe('Save Signals', () => {
    it('should emit pre_save and post_save on create', async () => {
      signals.preSave.connect((sender, instance, kwargs) => {
        signalCalls.push(`pre_save:${(instance as any).name}:isNew=${kwargs?.isNew}`);
      });

      signals.postSave.connect((sender, instance, kwargs) => {
        signalCalls.push(`post_save:${(instance as any).name}:created=${kwargs?.created}`);
      });

      const instance = await TestModel.objects.create({
        name: 'SaveTest',
      });

      expect(signalCalls).toContain('pre_save:SaveTest:isNew=true');
      expect(signalCalls).toContain(`post_save:SaveTest:created=true`);
      expect(instance.id).toBeDefined();
    });

    it('should emit pre_save and post_save on update', async () => {
      // Create instance first
      const instance = await TestModel.objects.create({
        name: 'Original',
      });

      // Clear calls from create
      signalCalls.length = 0;

      // Connect handlers
      signals.preSave.connect((sender, inst, kwargs) => {
        signalCalls.push(`pre_save:${(inst as any).name}:isNew=${kwargs?.isNew}`);
      });

      signals.postSave.connect((sender, inst, kwargs) => {
        signalCalls.push(`post_save:${(inst as any).name}:created=${kwargs?.created}`);
      });

      // Update
      instance.name = 'Updated';
      await instance.save();

      expect(signalCalls).toContain('pre_save:Updated:isNew=false');
      expect(signalCalls).toContain('post_save:Updated:created=false');
    });

    it('should allow modifying instance in pre_save', async () => {
      signals.preSave.connect((sender, instance) => {
        // Modify count in pre_save
        (instance as any).count = 42;
      });

      const instance = await TestModel.objects.create({
        name: 'ModifyTest',
        count: 10,
      });

      expect(instance.count).toBe(42);
    });

    it('should pass correct sender to save signals', async () => {
      let receivedSender: unknown;

      signals.postSave.connect((sender) => {
        receivedSender = sender;
      });

      await TestModel.objects.create({ name: 'Test' });

      expect(receivedSender).toBe(TestModel);
    });
  });

  describe('Delete Signals', () => {
    it('should emit pre_delete and post_delete', async () => {
      signals.preDelete.connect((sender, instance) => {
        signalCalls.push(`pre_delete:${(instance as any).name}`);
      });

      signals.postDelete.connect((sender, instance) => {
        signalCalls.push(`post_delete:${(instance as any).name}`);
      });

      const instance = await TestModel.objects.create({
        name: 'DeleteTest',
      });

      await instance.delete();

      expect(signalCalls).toContain('pre_delete:DeleteTest');
      expect(signalCalls).toContain('post_delete:DeleteTest');
    });

    it('should pass correct sender to delete signals', async () => {
      let receivedSender: unknown;

      signals.postDelete.connect((sender) => {
        receivedSender = sender;
      });

      const instance = await TestModel.objects.create({ name: 'Test' });
      await instance.delete();

      expect(receivedSender).toBe(TestModel);
    });
  });

  describe('Sender Filtering', () => {
    it('should only call handlers for specific sender', async () => {
      // Define another model
      class OtherModel extends Model {
        declare id?: number;
        declare value: string;
        static objects: Manager<OtherModel>;
      }

      OtherModel.init({
        value: new CharField({ maxLength: 50 }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (OtherModel as any).setAdapter(adapter);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      OtherModel.objects = new Manager(OtherModel as any, adapter);

      // Connect handler only for TestModel
      signals.postSave.connect(
        (sender, instance) => {
          signalCalls.push(`TestModel:${(instance as any).name}`);
        },
        TestModel
      );

      // Connect handler only for OtherModel
      signals.postSave.connect(
        (sender, instance) => {
          signalCalls.push(`OtherModel:${(instance as any).value}`);
        },
        OtherModel
      );

      // Create instances
      await TestModel.objects.create({ name: 'Test' });
      await OtherModel.objects.create({ value: 'Other' });

      expect(signalCalls).toContain('TestModel:Test');
      expect(signalCalls).toContain('OtherModel:Other');
      expect(signalCalls).toHaveLength(2);
    });
  });

  describe('Signal Disconnect', () => {
    it('should disconnect handler', async () => {
      const handler = (sender: unknown, instance: unknown) => {
        signalCalls.push(`called:${(instance as any).name}`);
      };

      signals.postSave.connect(handler);

      // Create first instance
      await TestModel.objects.create({ name: 'First' });
      expect(signalCalls).toContain('called:First');

      // Disconnect
      signals.postSave.disconnect(handler);
      signalCalls.length = 0;

      // Create second instance
      await TestModel.objects.create({ name: 'Second' });
      expect(signalCalls).not.toContain('called:Second');
      expect(signalCalls).toHaveLength(0);
    });
  });

  describe('Multiple Handlers', () => {
    it('should call multiple handlers in order', async () => {
      signals.postSave.connect(() => {
        signalCalls.push('handler1');
      });

      signals.postSave.connect(() => {
        signalCalls.push('handler2');
      });

      signals.postSave.connect(() => {
        signalCalls.push('handler3');
      });

      await TestModel.objects.create({ name: 'MultiTest' });

      expect(signalCalls).toEqual(['handler1', 'handler2', 'handler3']);
    });
  });
});
