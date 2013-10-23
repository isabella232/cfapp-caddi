var cf  = {
    adurl: 'http://ib.adnxs.com/ttj'  + window.location.search,
    ts: Date.now(), 
    ttl: 1200,
    debug: 0,
    ack: window.location.search.match('ext_inv_code=') ? 'wait' : 'cancel',
    loc:  location.protocol + '//' + window.location.host,
    evMsg: function(e) {
        D( 'evMsg from=' + e.origin + ' data='+e.data +  ' our ack='+cf.ack );
        if ( e.origin !== cf.loc ) return;
        if ( ! cf.debug) cf.debug = e.data.match('debug');

        if ( (Date.now() - cf.ts) > cf.ttl ) {
            if ( cf.ack !== 'ok' ) cf.ack = 'cancel';     // timeout condition (eg. 404) 
            D( ' TTL expires; set to cancel; ack='+cf.ack );
        }
        e.source.postMessage('slider:'+cf.ack, event.origin);
    },
    loader: function(){
        D('read_ad_content', cf );

        var  ct = 0;
        var body = document.getElementsByTagName('body')[0];
        if (body) {
            body.removeChild( document.getElementById("ads"));
            ct = body.children.length;
        }
        if ( ct > 0) { 
            cf.ack = 'ok';
        }else {
            cf.ack = 'cancel';
        }
        D(' loader -- setting ack=' + cf.ack );
        if (cf.evMsg) window.addEventListener("message", cf.evMsg, false); // re-add if nuked? TODO: detect nukeage
    }
},
D       = function(m,o) { if (cf.debug) console.log( (Date.now() - cf.ts) +"ms.  slider IFRAME: "+m, o); };

window.onload = function (){
    D( 'onLoad is begins: '+window.location.search,cf);

    window.addEventListener("message", cf.evMsg, false);

    if (cf.ack == 'cancel') return;

    var ad  = document.createElement('script'); ad.type = 'text/javascript'; ad.async = true;
    ad.src = cf.adurl;
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ad, s);
    document.write('<div id="ads"></div>');

    if ('onload' in ad){
        ad.onload = cf.loader;
    }else{
        ad.onreadystatechange = function(){
            if( this.readyState === 'complete') {
                cf.loader();
            }
        };
    }
};
