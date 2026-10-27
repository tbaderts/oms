import { describe, expect, it } from 'vitest';
import { editableDocument, editableStage, type SpecTicketStatus } from '../../src/shared/types/specTickets';

const ticket = (status: SpecTicketStatus, blockedFrom = '', archived = false) => ({ status, blockedFrom, archived });

describe('editableDocument', () => {
  it('maps each stage to its document', () => {
    expect(editableDocument(ticket('proposal'))).toBe('proposal');
    expect(editableDocument(ticket('design'))).toBe('design');
    expect(editableDocument(ticket('plan'))).toBe('tasks');
    expect(editableDocument(ticket('implement'))).toBe('tasks');
    expect(editableDocument(ticket('verify'))).toBe('verification');
    expect(editableStage(ticket('plan'))).toBe('plan');
  });

  it('blocked uses blocked_from', () => {
    expect(editableDocument(ticket('blocked', 'design'))).toBe('design');
    expect(editableStage(ticket('blocked', 'implement'))).toBe('implement');
    expect(editableDocument(ticket('blocked', ''))).toBeNull();
    expect(editableDocument(ticket('blocked', 'nonsense'))).toBeNull();
  });

  it('archived and done have none', () => {
    expect(editableDocument(ticket('done'))).toBeNull();
    expect(editableDocument(ticket('proposal', '', true))).toBeNull();
    expect(editableDocument(ticket('blocked', 'design', true))).toBeNull();
    expect(editableStage(ticket('done'))).toBeNull();
  });
});
