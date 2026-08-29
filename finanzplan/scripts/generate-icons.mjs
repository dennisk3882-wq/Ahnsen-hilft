import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
function crc32(buf){let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc])}
function png(size,maskable=false){
  const rows=Buffer.alloc((size*4+1)*size),bg=[11,30,71,255],blue=[72,94,255,255],white=[255,255,255,255],green=[32,189,138,255];
  const set=(x,y,c)=>{if(x<0||y<0||x>=size||y>=size)return;const p=y*(size*4+1)+1+x*4;rows[p]=c[0];rows[p+1]=c[1];rows[p+2]=c[2];rows[p+3]=c[3]};
  for(let y=0;y<size;y++){rows[y*(size*4+1)]=0;for(let x=0;x<size;x++)set(x,y,bg)}
  const m=Math.round(size*(maskable?.22:.14)),radius=size*.19;
  // soft geometric brand field
  for(let y=m;y<size-m;y++)for(let x=m;x<size-m;x++){const dx=Math.min(x-m,size-m-1-x),dy=Math.min(y-m,size-m-1-y);if(dx>=radius||dy>=radius||((dx-radius)**2+(dy-radius)**2<=radius**2))set(x,y,blue)}
  const left=Math.round(size*.31),bottom=Math.round(size*.69),barW=Math.max(8,Math.round(size*.075)),gap=Math.round(size*.055),heights=[.18,.29,.4];
  heights.forEach((h,i)=>{const x0=left+i*(barW+gap),top=bottom-Math.round(size*h);for(let y=top;y<=bottom;y++)for(let x=x0;x<x0+barW;x++)set(x,y,white)});
  // rising line + endpoint
  const pts=[[.29,.59],[.43,.5],[.56,.54],[.7,.39]];for(let i=1;i<pts.length;i++){let [x0,y0]=pts[i-1].map(v=>Math.round(v*size)),[x1,y1]=pts[i].map(v=>Math.round(v*size));const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let s=0;s<=steps;s++){const x=Math.round(x0+(x1-x0)*s/steps),y=Math.round(y0+(y1-y0)*s/steps);for(let oy=-Math.max(2,size*.009);oy<=Math.max(2,size*.009);oy++)for(let ox=-Math.max(2,size*.009);ox<=Math.max(2,size*.009);ox++)set(x+ox,y+oy,green)}}
  const cx=Math.round(size*.7),cy=Math.round(size*.39),r=Math.round(size*.028);for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)set(cx+x,cy+y,green);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))])
}
writeFileSync(new URL('../icon-192.png',import.meta.url),png(192,false));
writeFileSync(new URL('../icon-512.png',import.meta.url),png(512,false));
writeFileSync(new URL('../icon-maskable-512.png',import.meta.url),png(512,true));
console.log('Finanzplan PNG icons generated');
