#!/usr/bin/env node
/**
 * Lightweight Mermaid diagram syntax validator
 * Checks for basic syntax errors without rendering (no Puppeteer needed)
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Simple validation rules
const validators = [
  {
    name: 'Mermaid code blocks exist',
    test: (content) => /```mermaid[\s\S]*?```/.test(content),
    error: 'No Mermaid code blocks found'
  },
  {
    name: 'Code blocks are properly closed',
    test: (content) => {
      // Match complete mermaid blocks (opening and closing)
      const blocks = content.match(/```mermaid[\s\S]*?```/g) || [];
      const opens = (content.match(/```mermaid/g) || []).length;
      return blocks.length === opens;
    },
    error: 'Unclosed Mermaid code blocks'
  },
  {
    name: 'Graph declarations are valid',
    test: (content) => {
      const mermaidBlocks = content.match(/```mermaid([\s\S]*?)```/g) || [];
      return mermaidBlocks.every(block => {
        // Check for valid graph type declarations
        return /graph\s+(TB|BT|LR|RL|TD)/i.test(block) || 
               /flowchart\s+(TB|BT|LR|RL|TD)/i.test(block) ||
               /sequenceDiagram/i.test(block) ||
               /classDiagram/i.test(block);
      });
    },
    error: 'Invalid or missing graph type declaration (should be: graph TB, flowchart LR, etc.)'
  },
  {
    name: 'No empty Mermaid blocks',
    test: (content) => {
      const mermaidBlocks = content.match(/```mermaid([\s\S]*?)```/g) || [];
      return mermaidBlocks.every(block => {
        const code = block.replace(/```mermaid|```/g, '').trim();
        return code.length > 0;
      });
    },
    error: 'Empty Mermaid code blocks found'
  }
];

let hasErrors = false;

// Find all markdown files in docs/
const markdownFiles = fs.readdirSync(DOCS_DIR)
  .filter(file => file.endsWith('.md'))
  .map(file => path.join(DOCS_DIR, file));

console.log('Validating Mermaid diagrams...\n');

markdownFiles.forEach(filePath => {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Skip files without Mermaid blocks
  if (!/```mermaid/.test(content)) {
    return;
  }
  
  console.log(`📄 ${fileName}`);
  
  validators.forEach(validator => {
    if (!validator.test(content)) {
      console.log(`  ❌ ${validator.name}: ${validator.error}`);
      hasErrors = true;
    } else {
      console.log(`  ✅ ${validator.name}`);
    }
  });
  
  console.log('');
});

if (hasErrors) {
  console.log('❌ Validation failed!\n');
  process.exit(1);
} else {
  console.log('✅ All Mermaid diagrams are valid!\n');
  process.exit(0);
}
