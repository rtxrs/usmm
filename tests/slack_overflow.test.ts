import { describe, it, expect } from 'vitest';
import { SlackFormatter } from '../src/utils/SlackFormatter.js';

describe('SlackFormatter Overflow Handling', () => {
  
  it('should split extremely long headers into header + sections', () => {
    const longHeader = 'H'.repeat(3500);
    const caption = `<div class="header">${longHeader}</div>`;
    
    const blocks = SlackFormatter.parse(caption);
    
    // Should have 1 header block and at least 1 section block
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0].type).toBe('header');
    expect(blocks[0].text.text.length).toBe(3000);
    
    expect(blocks[1].type).toBe('section');
    expect(blocks[1].text.text).toContain('HHHHH');
    expect(blocks[1].text.text.length).toBe(500);
  });

  it('should move long confirmation text to an auxiliary context block', () => {
    const longConfirm = 'Confirm'.repeat(50); // 350 chars
    const caption = `<a class="btn-primary" href="https://ok.com"><confirm title="Alert">${longConfirm}</confirm>Deploy</a>`;
    
    const blocks = SlackFormatter.parse(caption);
    
    // Should have a context block for the detail + an actions block for the button
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'context' }));
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'actions' }));
    
    const contextBlock = blocks.find(b => b.type === 'context');
    expect(contextBlock.elements[0].text).toContain('*Confirmation Detail:*');
    expect(contextBlock.elements[0].text).toContain(longConfirm);

    const actionsBlock = blocks.find(b => b.type === 'actions');
    const button = actionsBlock.elements[0];
    expect(button.confirm.text.text.length).toBe(300); // Truncated for Slack API safety
  });

});
