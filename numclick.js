(function(){
  'use strict';

  // ---- スタイル注入 ----
  var style=document.createElement('style');
  style.textContent=
    '.qnum{border-bottom:1px dashed currentColor;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0.1);transition:background-color .15s ease}' +
    '.qnum.qnum-flash{background-color:rgba(24,95,165,0.25)}' +
    '.ans-flash{background-color:rgba(24,95,165,0.25)!important;transition:background-color .15s ease}';
  document.head.appendChild(style);

  // ラップ対象から除外するタグ・セレクタ
  var SKIP_TAGS={SCRIPT:1,STYLE:1,BUTTON:1,INPUT:1,SELECT:1,TEXTAREA:1,A:1};
  var SKIP_SELECTOR='#calc-disp,.calc-display,.calc-grid,.nav';

  var NUM_RE=/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

  function shouldSkipAncestor(node){
    var el=node;
    while(el){
      if(el.nodeType===1){
        if(SKIP_TAGS[el.tagName])return true;
        if(el.classList&&el.classList.contains('qnum'))return true;
        if(el.matches&&el.matches(SKIP_SELECTOR))return true;
      }
      el=el.parentNode;
    }
    return false;
  }

  function wrapTextNode(textNode){
    var text=textNode.nodeValue;
    NUM_RE.lastIndex=0;
    if(!NUM_RE.test(text))return false;
    NUM_RE.lastIndex=0;
    var frag=document.createDocumentFragment();
    var lastIndex=0;
    var m;
    var changed=false;
    while((m=NUM_RE.exec(text))){
      if(m.index>lastIndex){
        frag.appendChild(document.createTextNode(text.slice(lastIndex,m.index)));
      }
      var span=document.createElement('span');
      span.className='qnum';
      span.textContent=m[0];
      frag.appendChild(span);
      lastIndex=m.index+m[0].length;
      changed=true;
    }
    if(!changed)return false;
    if(lastIndex<text.length){
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode.replaceChild(frag,textNode);
    return true;
  }

  function collectTextNodes(root){
    var result=[];
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode:function(node){
        if(!node.nodeValue||!/\d/.test(node.nodeValue))return NodeFilter.FILTER_REJECT;
        if(shouldSkipAncestor(node.parentNode))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while((n=walker.nextNode()))result.push(n);
    return result;
  }

  var processing=false;

  function wrapNumbers(root){
    if(processing)return;
    processing=true;
    try{
      var nodes=collectTextNodes(root||document.body);
      for(var i=0;i<nodes.length;i++){
        wrapTextNode(nodes[i]);
      }
    }finally{
      processing=false;
    }
  }

  // ---- 初回実行 ----
  function init(){
    wrapNumbers(document.body);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }

  // ---- MutationObserver ----
  var observer=new MutationObserver(function(mutations){
    if(processing)return;
    var needsScan=false;
    for(var i=0;i<mutations.length;i++){
      var mu=mutations[i];
      if(mu.type==='childList'&&(mu.addedNodes.length>0)){
        needsScan=true;
        break;
      }
    }
    if(needsScan)wrapNumbers(document.body);
  });
  function startObserver(){
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.body){
    startObserver();
  }else{
    document.addEventListener('DOMContentLoaded',startObserver);
  }

  // ---- カンマ整形 ----
  function fmtVal(s){
    var parts=s.split('.');
    var intPart=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
    return parts.length>1?intPart+'.'+parts[1]:intPart;
  }

  // ---- クリック委譲 ----
  document.addEventListener('click',function(e){
    var target=e.target;
    var el=target.closest?target.closest('.qnum'):null;
    if(!el)return;
    if(typeof cs==='undefined')return;
    var dispEl=document.getElementById('calc-disp');
    if(!dispEl)return;
    var raw=el.textContent.replace(/,/g,'');
    if(!/^\d+(\.\d+)?$/.test(raw))return;
    cs.disp=raw;
    cs.fresh=false;
    dispEl.textContent=fmtVal(raw);

    // フィードバック用フラッシュ
    el.classList.add('qnum-flash');
    setTimeout(function(){el.classList.remove('qnum-flash');},200);
  });

  // ---- 電卓 → 回答欄へ反映（全ページ共通） ----
  // 反映先は「上から見て最初の空欄」。
  // ただし欄をタップして選んでいる間だけは、その欄が反映先になる（行を飛ばして
  // 入れたいとき用）。選択状態は、反映するか手入力すると解除される。
  var ANS_SKIP='.calc-grid,.calc-display,.nav';
  var ANS_TYPES={text:1,number:1,tel:1,search:1};

  function isAnsInput(el){
    if(!el||el.tagName!=='INPUT')return false;
    if(!ANS_TYPES[(el.getAttribute('type')||'text').toLowerCase()])return false;
    if(el.disabled||el.readOnly)return false;
    if(el.closest&&el.closest(ANS_SKIP))return false;
    if(el.getClientRects().length===0)return false;   // 非表示の欄は対象外
    return true;
  }

  function ansInputs(){
    var all=document.querySelectorAll('input');
    var out=[];
    for(var i=0;i<all.length;i++)if(isAnsInput(all[i]))out.push(all[i]);
    return out;
  }

  function firstEmpty(){
    var list=ansInputs();
    for(var i=0;i<list.length;i++)if(list[i].value.trim()==='')return list[i];
    return null;
  }

  // タップして選んだ欄。手入力するとその欄はもう空ではないので選択を解除する
  // （解除しないと、次の反映が手入力した値を上書きしてしまう）。
  var lastAns=null;
  document.addEventListener('focusin',function(e){
    if(isAnsInput(e.target))lastAns=e.target;
  });
  document.addEventListener('input',function(e){
    if(e.isTrusted&&isAnsInput(e.target))lastAns=null;
  });

  function pickTarget(){
    if(lastAns&&document.contains(lastAns)&&isAnsInput(lastAns))return lastAns;
    return firstEmpty();
  }

  window.calcToAns=function(){
    if(typeof cs==='undefined'||!cs)return;
    var n=parseFloat(cs.disp);
    if(isNaN(n))return;
    var el=pickTarget();
    if(!el)return;
    var hadFocus=isAnsInput(document.activeElement);
    el.value=String(Math.round(n));
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.classList.add('ans-flash');
    setTimeout(function(){el.classList.remove('ans-flash');},250);

    // 反映したら選択を解除。続けて押すと次の空欄へ入る。
    // 欄にフォーカスが残っている場合（キーボードOFFのページ）はカーソルも一緒に送る。
    lastAns=null;
    if(hadFocus){
      var next=firstEmpty();
      if(next)next.focus();else el.blur();
    }
  };

})();
