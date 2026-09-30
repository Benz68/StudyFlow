// A brief local acknowledgment; never delays saving or changes keyboard focus.
export function celebrateCompletion(button){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const rect=button.getBoundingClientRect();
 for(let i=0;i<9;i++){
  const dot=document.createElement('i');dot.className='completion-burst';dot.ariaHidden='true';
  const angle=i*Math.PI*2/9;
  dot.style.cssText=`left:${rect.left+rect.width/2}px;top:${rect.top+rect.height/2}px;--dx:${Math.cos(angle)*64}px;--dy:${Math.sin(angle)*54-20}px`;
  document.body.append(dot);setTimeout(()=>dot.remove(),700);
 }
}
