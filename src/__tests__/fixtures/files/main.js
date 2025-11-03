console.log('Test JavaScript file loaded');

function greet(name) {
  return `Hello, ${name}!`;
}

document.addEventListener('DOMContentLoaded', () => {
  console.log(greet('World'));
});
