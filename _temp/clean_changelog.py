"""Clean CHANGELOG.md: merge duplicate ### sections, dedupe entries within and across versions."""
import re
from collections import OrderedDict

def clean_changelog(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # ---- PARSE ----
    blocks = []
    current_block = None
    current_section_type = None
    current_entry_lines = []
    
    def flush_entry():
        nonlocal current_entry_lines
        if current_entry_lines and current_block is not None and current_section_type is not None:
            entry_text = ''.join(current_entry_lines).rstrip('\n')
            if entry_text.strip():
                current_block['sections'][-1]['entries'].append(entry_text)
        current_entry_lines = []
    
    for line in lines:
        if line.startswith('## ['):
            flush_entry()
            current_section_type = None
            block = {'header': line, 'sections': []}
            blocks.append(block)
            current_block = block
            continue
        if current_block is None:
            continue
        section_match = re.match(r'^(### <span[^>]*>([^<]+)</span>)\s*$', line)
        if section_match:
            flush_entry()
            current_section_type = section_match.group(2)
            current_block['sections'].append({
                'type': current_section_type,
                'header': section_match.group(1),
                'entries': []
            })
            continue
        if line.startswith('- ') and current_section_type is not None:
            flush_entry()
            current_entry_lines = [line]
            continue
        if current_entry_lines and line.strip():
            current_entry_lines.append(line)
            continue
        if current_entry_lines:
            flush_entry()
    flush_entry()
    
    # ---- MERGE SECTIONS WITHIN EACH VERSION + DEDUPE ----
    for block in blocks:
        merged = OrderedDict()
        for sec in block['sections']:
            stype = sec['type']
            if stype not in merged:
                merged[stype] = {'header': sec['header'], 'entries': []}
            merged[stype]['entries'].extend(sec['entries'])
        
        for stype, group in merged.items():
            seen = set()
            unique = []
            for entry in group['entries']:
                title_match = re.search(r'<strong>(.*?)</strong>', entry)
                key = title_match.group(1) if title_match else entry[:80]
                if key not in seen:
                    seen.add(key)
                    unique.append(entry)
            group['entries'] = unique
        
        block['merged'] = merged
    
    # ---- CROSS-VERSION DEDUPE (keep only in first/newest version) ----
    seen_titles = set()
    for block in blocks:
        merged = block['merged']
        for stype, group in merged.items():
            unique = []
            for entry in group['entries']:
                title_match = re.search(r'<strong>(.*?)</strong>', entry)
                key = title_match.group(1) if title_match else entry[:80]
                if key not in seen_titles:
                    seen_titles.add(key)
                    unique.append(entry)
            group['entries'] = unique
    
    # ---- REBUILD ----
    output_lines = []
    preamble_done = False
    for line in lines:
        if not preamble_done:
            if line.startswith('## ['):
                preamble_done = True
                break
            output_lines.append(line)
    
    for block in blocks:
        merged = block['merged']
        # Skip versions with no entries left
        total_entries = sum(len(g['entries']) for g in merged.values())
        if total_entries == 0:
            continue
        
        output_lines.append(block['header'])
        for i, (stype, group) in enumerate(merged.items()):
            if not group['entries']:
                continue
            output_lines.append(group['header'] + '\n')
            for entry in group['entries']:
                output_lines.append(entry + '\n')
            if i < len(merged) - 1:
                output_lines.append('\n')
        output_lines.append('\n')
    
    result = ''.join(output_lines)
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.rstrip() + '\n'
    
    if result != ''.join(lines):
        with open(path, 'w', encoding='utf-8') as f:
            f.write(result)
        removed = len(''.join(lines)) - len(result)
        print(f'{path}: cleaned ({len("".join(lines))} -> {len(result)} chars, removed {removed} chars)')
        return True
    else:
        print(f'{path}: no changes needed')
        return False

clean_changelog('derp_docs/CHANGELOG.md')
