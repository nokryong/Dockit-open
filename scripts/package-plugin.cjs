const { packagePlugin } = require('../plugin-sdk/package.cjs');

if (require.main === module) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) { console.error('Usage: node scripts/package-plugin.cjs <built-plugin-directory> <output.zip>'); process.exitCode = 1; }
  else packagePlugin(source, output).then(file => console.log(file)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { packagePlugin };
