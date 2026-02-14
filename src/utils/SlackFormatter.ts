export class SlackFormatter {
  static parse(caption: string, media?: { id: string, type: 'image' | 'video' }[]): any[] {
    const blocks: any[] = [];
    let text = caption.trim();
    let currentActions: any[] = [];

    const flushActions = () => {
      if (currentActions.length > 0) {
        blocks.push({ type: 'actions', elements: [...currentActions] });
        currentActions = [];
      }
    };

    while (text.length > 0) {
      const startMatch = /<(div|a|hr|img|select|input|ul|br)\s*([^>]*?)>/i.exec(text);

      if (!startMatch) {
        flushActions();
        if (text.trim()) blocks.push(this.createSection(this.toMarkdown(text.trim())));
        break;
      }

      const before = text.substring(0, startMatch.index).trim();
      if (before) {
        flushActions();
        blocks.push(this.createSection(this.toMarkdown(before)));
      }

      const tag = startMatch[1].toLowerCase();
      const attrs = this.parseAttributes(startMatch[2]);
      const className = attrs.class || '';

      let content = '';
      let fullTagLength = startMatch[0].length;

      if (['div', 'a', 'select', 'ul'].includes(tag)) {
        const closeIndex = this.findMatchingCloseTag(text, startMatch.index, tag);
        if (closeIndex !== -1) {
          content = text.substring(startMatch.index + startMatch[0].length, closeIndex).trim();
          fullTagLength = (closeIndex + `</${tag}>`.length) - startMatch.index;
        }
      }

      if ((tag === 'a' && (className.includes('btn') || attrs.value)) || tag === 'input' || (tag === 'select' && (className.includes('overflow') || !content.includes('field')))) {
        if (tag === 'a') {
          const style = className.includes('danger') ? 'danger' : (className.includes('primary') ? 'primary' : undefined);
          currentActions.push(this.createButton(content, attrs.href || '#', style, attrs.value));
        } else if (tag === 'input') {
          if (attrs.type === 'date') currentActions.push({ type: 'datepicker', initial_date: attrs.value, placeholder: { type: 'plain_text', text: attrs.placeholder || 'Select date' } });
          else if (attrs.type === 'time') currentActions.push({ type: 'timepicker', initial_time: attrs.value, placeholder: { type: 'plain_text', text: attrs.placeholder || 'Select time' } });
        } else if (tag === 'select') {
          currentActions.push(this.createSelect(content, attrs.placeholder, className.includes('overflow'), attrs.multiple !== undefined));
        }
      } else {
        flushActions();
        if (tag === 'div') {
          if (className === 'section') blocks.push(this.parseComplexSection(content));
          else if (className === 'header') blocks.push(this.createHeader(content));
          else if (className === 'context') blocks.push(this.parseContext(content));
          else if (className === 'divider') blocks.push({ type: 'divider' });
          else blocks.push(this.createSection(this.toMarkdown(content)));
        } else if (tag === 'ul') {
          blocks.push(this.createRichTextList(content));
        } else if (tag === 'hr') {
          blocks.push({ type: 'divider' });
        } else if (tag === 'img') {
          blocks.push(this.createImage(attrs.src || '', attrs.title, attrs.alt));
        } else if (tag === 'a') {
          blocks.push(this.createSection(`<${attrs.href || '#'}|${this.toMarkdown(content)}>`));
        }
      }
      text = text.substring(startMatch.index + fullTagLength).trim();
    }

    flushActions();
    if (media && media.length > 0) media.forEach(m => { if (m.type === 'image') blocks.push(this.createImage(m.id)); });
    return blocks.length > 0 ? blocks : [this.createSection('Empty message')];
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
      fields.push({ type: 'mrkdwn', text: this.toMarkdown(c.trim()) }); return '';
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
    if (text) section.text = { type: 'mrkdwn', text };
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
    if (remaining) elements.push({ type: 'mrkdwn', text: remaining });
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
      const opt: any = { text: { type: 'plain_text', text: m[2].trim() }, value: attrs.value || '' };
      if (attrs.class?.includes('danger')) opt.style = 'danger';
      options.push(opt);
    }
    if (isOverflow) return { type: 'overflow', options };
    return {
      type: isMulti ? 'multi_static_select' : 'static_select',
      placeholder: { type: 'plain_text', text: placeholder || 'Select' },
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

  private static createHeader(text: string) { return { type: 'header', text: { type: 'plain_text', text: text.substring(0, 3000), emoji: true } }; }
  private static createSection(markdown: string) { return { type: 'section', text: { type: 'mrkdwn', text: markdown.substring(0, 3000) } }; }
  private static createImage(url: string, title?: string, alt?: string) {
    const img: any = { type: 'image', image_url: url, alt_text: alt || title || 'image' };
    if (title) img.title = { type: 'plain_text', text: title.substring(0, 2000) };
    return img;
  }
  private static createButton(content: string, url: string, style?: string, value?: string) {
    let cleanText = content;
    let confirm: any = null;
    const confirmMatch = /<confirm\s*([^>]*?)>([\s\S]*?)<\/confirm>/i.exec(content);
    if (confirmMatch) {
      const cAttrs = this.parseAttributes(confirmMatch[1]);
      confirm = {
        title: { type: 'plain_text', text: cAttrs.title || 'Are you sure?' },
        text: { type: 'plain_text', text: confirmMatch[2].trim() },
        confirm: { type: 'plain_text', text: cAttrs.confirm || 'Yes' },
        deny: { type: 'plain_text', text: cAttrs.deny || 'No' }
      };
      cleanText = content.replace(confirmMatch[0], '').trim();
    }
    const btn: any = { type: 'button', text: { type: 'plain_text', text: this.toMarkdown(cleanText).replace(/\*/g, ''), emoji: true } };
    if (url && url !== '#') btn.url = url; if (style) btn.style = style; if (value) btn.value = value;
    if (confirm) btn.confirm = confirm;
    return btn;
  }
}
