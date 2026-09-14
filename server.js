const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const publicDir = path.join(__dirname, 'public');
const mimeTypes = {'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};

function createServer(root = publicDir) {
  const directory = path.resolve(root);
  return http.createServer(async (req,res) => {
    const send = (status,body,headers={}) => {res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff',...headers});res.end(req.method==='HEAD'?undefined:body);};
    if (!['GET','HEAD'].includes(req.method)) return send(405,'Método no permitido.',{Allow:'GET, HEAD'});
    try {
      const url = new URL(req.url, 'http://localhost');
      if(url.pathname==='/api/health')return send(200,JSON.stringify({ok:true,app:'PokéLab'}),{'Content-Type':'application/json; charset=utf-8'});
      const pathname = decodeURIComponent(url.pathname);
      if(pathname.includes('\0'))return send(400,'Ruta inválida.');
      const parts = pathname.split(/[\\/]/).filter(Boolean);
      if(parts.some(part=>part.startsWith('.')))return send(403,'Acceso denegado.');
      const target = path.resolve(directory, ...parts, ...(parts.length?[]:['index.html']));
      const relative = path.relative(directory,target);
      if(relative.startsWith('..') || path.isAbsolute(relative))return send(403,'Acceso denegado.');
      const type=mimeTypes[path.extname(target).toLowerCase()];
      if(!type)return send(404,'Recurso no encontrado.');
      const file=await fs.readFile(target);
      return send(200,file,{'Content-Type':type,'Cache-Control':'no-cache'});
    }catch(error){
      if(error instanceof URIError)return send(400,'Ruta inválida.');
      if(['ENOENT','EISDIR','ENOTDIR'].includes(error.code))return send(404,'Recurso no encontrado.');
      return send(500,'No se pudo servir el archivo.');
    }
  });
}
if(require.main===module){
  const port=Number(process.env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT debe ser un puerto válido.');
  const server=createServer();
  server.on('error',error=>{console.error(`No se pudo iniciar PokéLab: ${error.message}`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`PokéLab disponible localmente en http://127.0.0.1:${port}`));
}
module.exports={createServer};
