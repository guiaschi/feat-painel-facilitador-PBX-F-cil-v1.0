import fs from 'fs';

const inputs = JSON.parse(fs.readFileSync('trunk_form_debug.json', 'utf8'));

console.log('Total elements:', inputs.length);

// Print tabs
const tabs = inputs.filter(el => el.href && el.href.startsWith('#'));
console.log('--- Tabs found ---');
tabs.forEach(t => console.log(`Tab: ${t.text.trim()} -> ${t.href}`));

// Print relevant text inputs
const textInputs = inputs.filter(el => el.tagName === 'input' && (el.type === 'text' || el.type === 'password' || el.type === 'number'));
console.log('--- Relevant inputs ---');
textInputs.forEach(i => {
  if (i.name || i.id) {
    console.log(`Input: ${i.tagName}[name="${i.name}"][id="${i.id}"][type="${i.type}"] (value: "${i.value}")`);
  }
});
