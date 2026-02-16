export class SlackFormatter {
  static parse(caption: string, media?: { id: string, type: 'image' | 'video' }[]): any[] {
    const blocks: any[] = [];
    let text = caption;
    let currentActions: any[] = [];
    let currentMrkdwn = '';

    const flushMrkdwn = () => {
      if (currentMrkdwn.trim()) {
        this.pushSmartSections(blocks, currentMrkdwn.trim());
        currentMrkdwn = '';
      }
    };

    const flushActions = () => {
      if (currentActions.length > 0) {
        blocks.push({ type: 'actions', elements: [...currentActions] });
        currentActions = [];
      }
    };

    const flushAll = () => { flushMrkdwn(); flushActions(); };

    while (text.length > 0) {
      const startMatch = /<(div|a|hr|img|select|input|ul|br)\s*([^>]*?)>/i.exec(text);

      if (!startMatch) {
        currentMrkdwn += this.toMarkdown(text);
        text = '';
        break;
      }

      const before = text.substring(0, startMatch.index);
      currentMrkdwn += this.toMarkdown(before);

      const tag = startMatch[1].toLowerCase();
      const attrs = this.parseAttributes(startMatch[2]);
      const className = attrs.class || '';

      let content = '';
      let fullTagLength = startMatch[0].length;

      if (['div', 'a', 'select', 'ul'].includes(tag)) {
        const closeIndex = this.findMatchingCloseTag(text, startMatch.index, tag);
        if (closeIndex !== -1) {
          content = text.substring(startMatch.index + startMatch[0].length, closeIndex);
          fullTagLength = (closeIndex + `</${tag}>`.length) - startMatch.index;
        }
      }

      const isButton = tag === 'a' && (className.includes('btn') || attrs.value);
      const isBlock = ['div', 'hr', 'ul', 'select', 'input'].includes(tag) || (tag === 'img' && !content);

      if (isButton) {
        flushMrkdwn();
        const style = className.includes('danger') ? 'danger' : (className.includes('primary') ? 'primary' : undefined);
        currentActions.push(this.createButton(blocks, this.toMarkdown(content).trim(), attrs.href || '#', style, attrs.value));
      } else if (isBlock) {
        flushAll();
        const trimmedContent = content.trim();
        if (tag === 'div') {
          if (className === 'section') blocks.push(this.parseComplexSection(trimmedContent));
          else if (className === 'header') this.createHeader(blocks, trimmedContent);
          else if (className === 'context') blocks.push(this.parseContext(trimmedContent));
          else if (className === 'divider') blocks.push({ type: 'divider' });
          else this.pushSmartSections(blocks, this.toMarkdown(trimmedContent));
        } else if (tag === 'ul') blocks.push(this.createRichTextList(trimmedContent));
        else if (tag === 'hr') blocks.push({ type: 'divider' });
        else if (tag === 'img') blocks.push(this.createImage(attrs.src || '', attrs.title, attrs.alt));
        else if (tag === 'select') blocks.push({ type: 'actions', elements: [this.createSelect(trimmedContent, attrs.placeholder, className.includes('overflow'), attrs.multiple !== undefined)] });
        else if (tag === 'input') {
          const picker: any = { placeholder: { type: 'plain_text', text: attrs.placeholder || 'Select' } };
          if (attrs.type === 'date') { picker.type = 'datepicker'; picker.initial_date = attrs.value; }
          else if (attrs.type === 'time') { picker.type = 'timepicker'; picker.initial_time = attrs.value; }
          blocks.push({ type: 'actions', elements: [picker] });
        }
      } else {
        if (tag === 'a') currentMrkdwn += `<${attrs.href || '#'}|${this.toMarkdown(content)}>`;
        else if (tag === 'br') currentMrkdwn += '\n';
      }

      text = text.substring(startMatch.index + fullTagLength);
    }

    flushAll();
    if (media && media.length > 0) media.forEach(m => { if (m.type === 'image') blocks.push(this.createImage(m.id)); });
    return blocks.length > 0 ? blocks : [this.createSection('Empty message')];
  }

  /**
   * Pushes one or more sections depending on text length to respect Slack's 3000 char limit.
   */
  private static pushSmartSections(blocks: any[], markdown: string) {
    if (markdown.length <= 3000) {
      blocks.push(this.createSection(markdown));
      return;
    }

    // Split logic: find nearest newline before 3000 limit to maintain readability
    let remaining = markdown;
    while (remaining.length > 0) {
      if (remaining.length <= 3000) {
        blocks.push(this.createSection(remaining));
        break;
      }

      let chunk = remaining.substring(0, 3000);
      let splitIndex = chunk.lastIndexOf('\n');
      
      // If no newline found, split at 3000 chars
      if (splitIndex === -1 || splitIndex < 2000) splitIndex = 3000;

      blocks.push(this.createSection(remaining.substring(0, splitIndex).trim()));
      remaining = remaining.substring(splitIndex).trim();
    }
  }

  private static findMatchingCloseTag(text: string, startIndex: number, tag: string): number {
    const openTag = `<${tag}`; const closeTag = `</${tag}>`;
    let count = 0; let pos = startIndex;
    while (pos < text.length) {
      if (text.substring(pos, pos + openTag.length).toLowerCase() === openTag) { count++; pos += openTag.length; }
      else if (text.substring(pos, pos + closeTag.length).toLowerCase() === closeTag) { count--; if (count === 0) return pos; pos += closeTag.length; }
      else pos++;
    }
    return -1;
  }

  private static parseComplexSection(content: string) {
    const section: any = { type: 'section' }; const fields: any[] = []; let accessory: any = null;
    let text = content.replace(/<div\s+class=["']field["']\s*>([\s\S]*?)<\/div>/gi, (_, c) => {
      fields.push({ type: 'mrkdwn', text: this.toMarkdown(c.trim()).substring(0, 2000) }); return ''; // Fields have a smaller 2000 limit
    });
    text = text.replace(/<select\s*([^>]*?)>([\s\S]*?)<\/select>/gi, (_, attrStr, inner) => {
      const attrs = this.parseAttributes(attrStr);
      accessory = this.createSelect(inner, attrs.placeholder, attrs.class?.includes('overflow'), attrs.multiple !== undefined); return '';
    });
    text = text.replace(/<img\s*([^>]*?)\s*\/?>/gi, (_, attrStr) => {
      const attrs = this.parseAttributes(attrStr); accessory = { type: 'image', image_url: attrs.src, alt_text: attrs.alt || 'image' }; return '';
    });
    text = text.replace(/<a\s*([^>]*?)\s*>([\s\S]*?)<\/a>/gi, (_, attrStr, c) => {
      const attrs = this.parseAttributes(attrStr); return `<${attrs.href || '#'}|${this.toMarkdown(c.trim())}>`;
    });
    text = this.toMarkdown(text.trim());
    if (text) section.text = { type: 'mrkdwn', text: text.substring(0, 3000) };
    if (fields.length > 0) section.fields = fields;
    if (accessory) section.accessory = accessory;
    return section;
  }

  private static parseContext(content: string) {
    const elements: any[] = [];
    let text = content.replace(/<img\s*([^>]*?)\s*\/?>/gi, (_, attrStr) => {
      const attrs = this.parseAttributes(attrStr); elements.push({ type: 'image', image_url: attrs.src, alt_text: attrs.alt || 'icon' }); return '';
    });
    const remaining = this.toMarkdown(text.trim());
    if (remaining) elements.push({ type: 'mrkdwn', text: remaining.substring(0, 3000) });
    return { type: 'context', elements };
  }

  private static createRichTextList(content: string) {
    const elements: any[] = [];
    const liRegex = /<li>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRegex.exec(content)) !== null) {
      elements.push({ type: 'rich_text_section', elements: [{ type: 'text', text: this.toMarkdown(m[1].trim()).replace(/\*/g, '') }] });
    }
    return { type: 'rich_text', elements: [{ type: 'rich_text_list', style: 'bullet', indent: 0, elements }] };
  }

  private static createSelect(inner: string, placeholder?: string, isOverflow = false, isMulti = false) {
    const options: any[] = [];
    const optionRegex = /<option\s*([^>]*?)>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = optionRegex.exec(inner)) !== null) {
      const attrs = this.parseAttributes(m[1]);
      const opt: any = { text: { type: 'plain_text', text: m[2].trim().substring(0, 75) }, value: (attrs.value || '').substring(0, 75) };
      if (attrs.class?.includes('danger')) opt.style = 'danger';
      options.push(opt);
    }
    if (isOverflow) return { type: 'overflow', options };
    return {
      type: isMulti ? 'multi_static_select' : 'static_select',
      placeholder: { type: 'plain_text', text: (placeholder || 'Select').substring(0, 75) },
      options
    };
  }

  private static parseAttributes(str: string): Record<string, any> {
    const attrs: Record<string, any> = {};
    const regex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = regex.exec(str)) !== null) {
      const key = m[1].toLowerCase();
      attrs[key] = m[2] || m[3] || m[4] || true;
    }
    return attrs;
  }

  private static toMarkdown(text: string): string {
    return text.replace(/<br\s*\/?>/gi, '\n').replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '*$1*')
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '*$1*').replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '_$1_')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '_$1_').replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  }

  private static createHeader(blocks: any[], text: string) { 
    if (text.length <= 3000) {
      blocks.push({ type: 'header', text: { type: 'plain_text', text: text, emoji: true } });
      return;
    }

    // Header exceeds limit: Take first 3000 as header, rest as section
    blocks.push({ type: 'header', text: { type: 'plain_text', text: text.substring(0, 3000), emoji: true } });
    this.pushSmartSections(blocks, this.toMarkdown(text.substring(3000)));
  }
  private static createSection(markdown: string) { return { type: 'section', text: { type: 'mrkdwn', text: markdown } }; }
  private static createImage(url: string, title?: string, alt?: string) {
    const img: any = { type: 'image', image_url: url, alt_text: (alt || title || 'image').substring(0, 2000) };
    if (title) img.title = { type: 'plain_text', text: title.substring(0, 2000) };
    return img;
  }
  private static createButton(blocks: any[], content: string, url: string, style?: string, value?: string) {
    let cleanText = content; let confirm: any = null;
    const confirmMatch = /<confirm\s*([^>]*?)>([\s\S]*?)<\/confirm>/i.exec(content);
    if (confirmMatch) {
      const cAttrs = this.parseAttributes(confirmMatch[1]);
      const fullConfirmText = confirmMatch[2].trim();
      
      confirm = { 
        title: { type: 'plain_text', text: (cAttrs.title || 'Are you sure?').substring(0, 100) }, 
        text: { type: 'plain_text', text: fullConfirmText.substring(0, 300) }, 
        confirm: { type: 'plain_text', text: (cAttrs.confirm || 'Yes').substring(0, 30) }, 
        deny: { type: 'plain_text', text: (cAttrs.deny || 'No').substring(0, 30) } 
      };

      // If confirmation text was truncated, add an auxiliary context block before the action
      if (fullConfirmText.length > 300) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `*Confirmation Detail:* ${this.toMarkdown(fullConfirmText)}` }]
        });
      }

      cleanText = content.replace(confirmMatch[0], '').trim();
    }
    const btn: any = { type: 'button', text: { type: 'plain_text', text: this.toMarkdown(cleanText).replace(/\*/g, '').substring(0, 75), emoji: true } };
    if (url && url !== '#') btn.url = url; if (style) btn.style = style; if (value) btn.value = value?.substring(0, 2000);
    if (confirm) btn.confirm = confirm;
    return btn;
  }
}
