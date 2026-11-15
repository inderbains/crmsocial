import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function textPDF(text,timestamp='2000-01-01T00:00:00Z'){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);let page=pdf.addPage([612,792]),y=744;
 pdf.setCreationDate(new Date(timestamp));pdf.setModificationDate(new Date(timestamp));
 // Explicitly reject characters the standard font cannot represent rather than alter names.
 font.encodeText(text.replace(/[\r\n\t]/g,' '));
 for(const para of text.split('\n')){let line='';const words=para.split(' ');for(const word of words){const parts=[];let part='';for(const ch of word){if(font.widthOfTextAtSize(part+ch,10)>510){parts.push(part);part=''}part+=ch}parts.push(part);for(const token of parts){if(line&&font.widthOfTextAtSize(line+' '+token,10)>510){draw(line);line=token}else line+=(line?' ':'')+token}}draw(line)}
 function draw(line){if(y<48){page=pdf.addPage([612,792]);y=744}page.drawText(line,{x:48,y,size:10,font,color:rgb(.08,.17,.14)});y-=15}
 return pdf.save();
}
