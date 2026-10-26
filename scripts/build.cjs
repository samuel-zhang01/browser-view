const esbuild = require('esbuild');const fs = require('node:fs');
(async()=>{
 fs.mkdirSync('runtime/web',{recursive:true});
 await esbuild.build({entryPoints:['media/viewer.js'],bundle:true,minify:true,format:'esm',outfile:'media/viewer.bundle.js',target:'es2022'});
 await esbuild.build({entryPoints:['runtime/external.js'],bundle:true,minify:true,format:'esm',outfile:'runtime/web/viewer.js',target:'es2022'});
 fs.copyFileSync('runtime/demo.html','runtime/web/demo.html');
 fs.copyFileSync('runtime/viewer.html','runtime/web/index.html');
 fs.copyFileSync('media/viewer.css','runtime/web/viewer.css');
 fs.writeFileSync('THIRD_PARTY_NOTICES.md','# Third-party notices\n\nThe bundled noVNC client is MPL-2.0. Its unmodified source is included in third_party/novnc. Playwright Core is Apache-2.0 and includes its LICENSE and NOTICE in node_modules/playwright-core. Browser binaries and OS tools are installed separately.\n');
 fs.mkdirSync('third_party/novnc',{recursive:true});
 for(const name of ['core','vendor','docs','AUTHORS']){if(fs.existsSync('node_modules/@novnc/novnc/'+name))fs.cpSync('node_modules/@novnc/novnc/'+name,'third_party/novnc/'+name,{recursive:true});}
})();
