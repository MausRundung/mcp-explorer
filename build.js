const { exec } = require('child_process');

console.log('Building project...');

exec('npx tsc', (error, stdout, stderr) => {
  if (error) {
    console.error('Build error:', error);
    return;
  }
  if (stderr) {
    console.error('Build stderr:', stderr);
  }
  console.log('Build complete:', stdout);
  
  console.log('Setting permissions...');
  
  const fs = require('fs');
  try {
    fs.chmodSync('build/index.js', '755');
    console.log('Permissions set successfully');
  } catch (e) {
    console.log('chmod failed:', e.message);
  }
});
