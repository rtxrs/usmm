export class SlackFormatter {
  static parse(caption: string, media?: { id: string, type: 'image' | 'video' }[]): any[] {
    // 1. Pre-process inline tags (Bold, Italic, Code, Br, and non-button Links)
    let processed = caption;

    // Handle escaped quotes commonly found in CURL/JSON payloads
    processed = processed.replace(/\\"/g, '"').replace(/\\'/g, "'");

    // Convert standard <a> to Slack link (if it doesn't have btn class)
    processed = processed.replace(/<a\s+(?![^>]*class=["']btn)(?:[^>]*?)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '<$1|$2>');

    // Convert <b>, <i>, <code>, <br>
    processed = processed.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '*$1*')
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '*$1*')
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '_$1_')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '_$1_')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // 2. Identify and Process Structural Blocks
    const blocks: any[] = [];
    let text = processed.trim();
    let currentActions: any[] = [];

    const flushActions = () => {
      if (currentActions.length > 0) {
        blocks.push({ type: 'actions', elements: [...currentActions] });
        currentActions = [];
      }
    };

    while (text.length > 0) {
      const match = /<(div|a|hr|img|select|input|ul)\s*([^>]*?)>/i.exec(text);

      if (!match) {
        flushActions();
        if (text.trim()) blocks.push(this.createSection(this.cleanupTags(text.trim())));
        break;
      }

      const before = text.substring(0, match.index).trim();
      if (before) {
        flushActions();
        blocks.push(this.createSection(this.cleanupTags(before)));
      }

      const tag = match[1].toLowerCase();
      const attrs = this.parseAttributes(match[2]);
      const className = attrs.class || '';

      let content = '';
      let fullTagLength = match[0].length;

      if (['div', 'a', 'select', 'ul'].includes(tag)) {
        const closeIndex = this.findMatchingCloseTag(text, match.index, tag);
        if (closeIndex !== -1) {
          content = text.substring(match.index + match[0].length, closeIndex).trim();
          fullTagLength = (closeIndex + `</${tag}>`.length) - match.index;
        }
      }

      if (tag === 'a' && (className.includes('btn') || attrs.value || attrs.action_id)) {
        const style = className.includes('danger') ? 'danger' : (className.includes('primary') ? 'primary' : undefined);
        currentActions.push(this.createButton(this.cleanupTags(content), attrs.href || '#', style, attrs.value || attrs.action_id));
      } else {
        flushActions();
        if (tag === 'div') {
          if (className === 'section') blocks.push(this.parseComplexSection(content));
          else if (className === 'header') blocks.push(this.createHeader(this.cleanupTags(content)));
          else if (className === 'context') blocks.push(this.parseContext(content));
          else if (className === 'divider') blocks.push({ type: 'divider' });
          else blocks.push(this.createSection(this.cleanupTags(content)));
        } else if (tag === 'ul') {
          blocks.push(this.createRichTextList(content));
        } else if (tag === 'hr') {
          blocks.push({ type: 'divider' });
        } else if (tag === 'img') {
          blocks.push(this.createImage(attrs.src || '', attrs.title, attrs.alt));
        } else if (tag === 'select') {
          blocks.push({ type: 'actions', elements: [this.createSelect(content, attrs.placeholder, className.includes('overflow'), attrs.multiple !== undefined)] });
        } else if (tag === 'input') {
          const picker: any = { placeholder: { type: 'plain_text', text: attrs.placeholder || 'Select' } };
          if (attrs.type === 'date') { picker.type = 'datepicker'; picker.initial_date = attrs.value; }
          else if (attrs.type === 'time') { picker.type = 'timepicker'; picker.initial_time = attrs.value; }
          blocks.push({ type: 'actions', elements: [picker] });
        } else {
          // Fallback: standard tag that survived pre-processing
          blocks.push(this.createSection(this.cleanupTags(content || match[0])));
        }
      }

      text = text.substring(match.index + fullTagLength).trim();
    }

    flushActions();

    if (media && media.length > 0) {
      media.forEach(m => { if (m.type === 'image') blocks.push(this.createImage(m.id)); });
    }

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
      fields.push({ type: 'mrkdwn', text: this.cleanupTags(c.trim()) }); return '';
    });
    text = text.replace(/<select\s*([^>]*?)>([\s\S]*?)<\/select>/gi, (_, attrStr, inner) => {
      const attrs = this.parseAttributes(attrStr);
      accessory = this.createSelect(inner, attrs.placeholder, attrs.class?.includes('overflow'), attrs.multiple !== undefined); return '';
    });
    text = text.replace(/<img\s*([^>]*?)\s*\/?>/gi, (_, attrStr) => {
      const attrs = this.parseAttributes(attrStr); accessory = { type: 'image', image_url: attrs.src, alt_text: attrs.alt || 'image' }; return '';
    });
    text = this.cleanupTags(text.trim());
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
    const remaining = this.cleanupTags(text.trim());
    if (remaining) elements.push({ type: 'mrkdwn', text: remaining });
    return { type: 'context', elements };
  }

  private static createRichTextList(content: string) {
    const elements: any[] = [];
    const liRegex = /<li>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRegex.exec(content)) !== null) {
      elements.push({ type: 'rich_text_section', elements: [{ type: 'text', text: this.cleanupTags(m[1].trim()).replace(/\*/g, '').replace(/_/g, '') }] });
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

  private static cleanupTags(text: string): string {
    // Strip any remaining unknown/malformed HTML tags, but preserve Slack's <url|text> and <@user> syntax
    return text.replace(/<(?!http|https|!|#)[^>]*>/g, '');
  }

  private static createHeader(text: string) { return { type: 'header', text: { type: 'plain_text', text: text.substring(0, 3000), emoji: true } }; }
  private static createSection(markdown: string) { return { type: 'section', text: { type: 'mrkdwn', text: markdown.substring(0, 3000) } }; }
  private static createImage(url: string, title?: string, alt?: string) {
    const img: any = { type: 'image', image_url: url, alt_text: alt || title || 'image' };
    if (title) img.title = { type: 'plain_text', text: title.substring(0, 2000) };
    return img;
  }
  private static createButton(content: string, url: string, style?: string, value?: string) {
    let cleanText = content; let confirm: any = null;
    const confirmMatch = /<confirm\s*([^>]*?)>([\s\S]*?)<\/confirm>/i.exec(content);
    if (confirmMatch) {
      const cAttrs = this.parseAttributes(confirmMatch[1]);
      confirm = { title: { type: 'plain_text', text: cAttrs.title || 'Are you sure?' }, text: { type: 'plain_text', text: confirmMatch[2].trim() }, confirm: { type: 'plain_text', text: cAttrs.confirm || 'Yes' }, deny: { type: 'plain_text', text: cAttrs.deny || 'No' } };
      cleanText = content.replace(confirmMatch[0], '').trim();
    }
    const btn: any = { type: 'button', text: { type: 'plain_text', text: cleanText.replace(/\*/g, '').replace(/_/g, ''), emoji: true } };
    if (url && url !== '#') btn.url = url; if (style) btn.style = style; if (value) btn.value = value;
    if (confirm) btn.confirm = confirm;
    return btn;
  }
}
