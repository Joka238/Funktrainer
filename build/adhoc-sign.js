// macOS: Ad-hoc-Signatur nach dem Packen.
// Ohne (gültige) Signatur meldet macOS auf Apple-Silicon-Macs "App ist beschädigt".
// Eine Ad-hoc-Signatur ersetzt keine Apple-Notarisierung, macht die App aber startbar
// (nach einmaligem "Trotzdem öffnen").
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Zwischenstände des Universal-Builds nicht signieren (werden danach zusammengeführt)
  if (/-temp$/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
