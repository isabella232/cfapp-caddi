CloudFlare.define( 'caddi', [       'caddi/config', 'cloudflare/dom',   'cloudflare/user',  'cloudflare/owl',   'cloudflare/jquery1.7',     'cloudflare/console' ],
                            function(cfg,           dom,                user,               owl,                $,                     console ) {

    /* config vars:
     *  text_only       [ 0 | 1 ]
     *  scroll          [ 0 | 1 ]
     *  debug           [ 1 | 0 ]
     *  user_pause_ttl  [ -1 | 0 | INT ] seconds
     *  orient          [ left | right | left_bottom | right_bottom ]
     *  ss_view_max_ct  [ 0 | INT ]
     *  view_ttl        [ 0 | INT ]  seconds; but used in MS timer
     *  min_resolution  [ 0 | 1024x0 | 1600x0 ]
     *  http_only       [ 0 | 1 ]  <--
     */

    // integer-gize!
    [ 'text_only', 'scroll', 'debug', 'user_pause_ttl', 'ss_view_max_ct', 'http_only', 'view_ttl' ].map(function(k){
        cfg[k] = parseInt(cfg[k], 10) || 0;
    });

    /*
     * setup vars
     */

    var delim       = '|',
        sessionTTL  = 1200,
        cookieCol   = ['timeFirst','sessionStart','N','sessionCt','sessionViewCt','pauseUntil','pauseSkipCt','impCt'],
        currTs      = function(){ return parseInt( (+(new Date()) / 1000 ), 10 ); },
        currTime    = currTs(),
        httpOnly    = 1,
        ext_inv_code= ( cfg.ext_inv_code && cfg.ext_inv_code != '_disabled_' ) ? cfg.ext_inv_code : null,
        placement_id= cfg.appnexus_placement_id,
        V           = cfg.version || '0.6.7',
        D           = cfg.debug || (window.location.hash.match('debug_view') ? 1 : 0),
        psa_disable = 1,
        cVal        = '',

        Dbg         = function(m,o){  if (! D) return;  if(o!==null){ console.log(m,o); }else{ console.log(m);} },

        installCookie = function(name,val,ttl) {
            var exp = new Date();
            if ( ttl ) { 
                exp.setTime( exp.getTime() + (ttl * 1000) );
            }
            Dbg(  'installCookie name=' + name + ' val=' + val );
            document.cookie = name + "=" + val + (ttl ? ";expires=" + exp.toUTCString() : '' );
        }, 

        readCookieAttrs = function(str) {
            var C = {},
                arr = str ? str.split(delim) : [];
            Dbg( "readCookieAttrs starts on str", str, arr );

            for ( var i = 0; i < cookieCol.length; i++ ){
                C[ cookieCol[i] ] = arr[i]  ? parseInt(arr[i], 10) : 0;
            }
            ( C.timeFirst && parseInt(C.timeFirst, 10) && C.timeFirst > 1354151978 )  || ( C.timeFirst  = currTime );
            if ( ! C.sessionStart ) C.sessionStart = currTime;

            Dbg( "readCookieAttrs returns", C );
            return C;
        },

        writeCookie = function(cName, C, ttl){
            var vals = [];
            for ( var i = 0; i < cookieCol.length; i++){
                vals.push( C[cookieCol[i]] || 0);
            }
            cVal    = vals.join(delim);
            installCookie( cName, cVal, ttl );
        },

        orient      = cfg.orient || 'left',
        isLeft      = orient.indexOf('left') >= 0   ? true : false,
        isBottom    = orient.indexOf('bottom') >= 0 ? true : false,
        useScroll   = cfg.scroll ? true : false,
        minRes      = ( cfg.min_resolution && cfg.min_resolution.indexOf('x') > 0 ) ?  cfg.min_resolution.split('x') : null,

        cookieName  =  'cfapp_caddi',
        cookie      =  readCookieAttrs( user.getCookie(cookieName) ),
        inSession   = (( currTime - cookie.sessionStart ) < sessionTTL ) ? 1 : 0,
        viewport    = dom.getViewport(),
        terminate   = false; 

    /*
     * logic: eligibility, cookie, etc.
     */
    Dbg( "caddi starts; version="+V+"config:", cfg );

    cookie.N++;

    if (dom.ios || dom.android ){ 
        terminate++;
    }
    if ( window.cf_slider_disable ) { 
        terminate++;
        Dbg( "cf_slider_disable by publisher; terminate="+terminate);
    }
    if ( httpOnly &&  window.location.protocol === 'https:' ){
        terminate++;
        Dbg( "httpOnly; terminate="+terminate);
    }

    if(  minRes && viewport ) {
        ( minRes[0] && viewport.width ) && ( minRes[0] <= viewport.width || terminate++ );
        ( minRes[1] && viewport.height ) && ( minRes[1] <= viewport.height || terminate++ );
        Dbg( "minRes check; terminate=" + terminate, minRes, viewport );
    }
    if( cookie.pauseUntil && cookie.pauseUntil >= currTime ){
        cookie.pauseSkipCt++;
        terminate++;
        Dbg( 'Ad serving is paused; seconds left=' + ( cookie.pauseUntil - currTime ) );
    }
    else if ( cookie.pauseUntil !== 0  ) {
        Dbg( 'Ad serving was paused; but active again.  Removing cookie setting? ' + cookie.pauseUntil );
        cookie.pauseUntil = 0;
    }

    if (! inSession ){ 
        cookie.sessionCt++;
        cookie.sessionStart     = currTime;
        cookie.sessionViewCt    = 0;
    }


    if ( cfg.ss_view_max_ct && cookie.sessionViewCt >= cfg.ss_view_max_ct ) {
        terminate++;
    }else{
        cookie.sessionViewCt++;
        cookie.impCt++;
    }

    writeCookie(cookieName,cookie);

    if ( terminate ) { 
        Dbg( 'TERMINATE; val='+ terminate );
        return;
    }

    if (! placement_id || ! ext_inv_code ){
        Dbg( 'no placement or ext_inv_code' );
        return;
    }

    var cfOwl           = owl.createDispatcher('caddi');

    Dbg( 'owl created cfOwl' , cfOwl );

    /* 
     * create HTML
     */


    var a   = 'cfad',     // id="cfad"
        ar  = '#'+a,     // reference of id;  #cfad
        b   = a + 'b',
        br  = '#'+b,
        x   = a + 'x',  // x=close
        xr  = '#'+x,
        f   = a + 'f',  // f=frame
        fr  = '#'+f,
        tx  = 1000,     // slider slide time
        fullWidth   = '310px',
        css = 
                ' #cfad  { height: 280px; width:0px; padding: 2px 0; position: absolute; z-index: 99999; line-height: 1px; overflow: hidden; } ' + 
                ' #cfadb  { position:relative }' + 
                ' #cfadf { height: 250px; width: 300px; margin: 0px; padding: 3px; background-color: #ffffff; border: 1px solid #404040; } ' +
                ' #cfadx { background-color: #ffffff; margin-top: -1px; color: #404040; font-weight: bold; font: 16px Helvetica,Arial,Sans-serif; padding: 0px 5px 0.6px 4px; text-decoration: none; border: 0; border-bottom:  1px solid #404040; position: absolute; display: block; } ' + 
                ' .cfad-l { left: 0px; } .cfad-r { right: 0px; text-align:right}  ' + 
                ' .cfadf-l { border-left: 0px ! important; } .cfadf-r { border-right:0px ! important; } ' + 
                ' .cfadx-l { border-right: 1px solid #404040 ! important; left : 0 ! important; } .cfadx-r { border-left:  1px solid #404040 ! important; right: 0 ! important; } ' + 
                ar + '.cfad-y-bot { bottom: 15px; } ' + 
                ar + '.cfad-y-top { top: 15px; } ',

        timeoutId   = null,
        currHost    = window.location.host.toLowerCase(),
        adParam       = '/cdn-cgi/nexp/acv=' + currTime  + '/apps/caddi/slider_iframe.html?' +
            'size=300x250' + '&id=' + placement_id +
            '&ext_inv_code=' + ext_inv_code + 
            ( ( isBottom && ! useScroll ) ? '' : '&position=above' ) +
            (  psa_disable ? '&psa=0' : '' ) +
            '&referrer=' + currHost + '&_t=' + currTime,

        adUrl       =  window.location.protocol +  '//' + currHost + adParam,

        iframe      = '<iframe id="'+f+'" frameborder="0" marginwidth="0" marginheight="0" scrolling="no" width="300" height="250" src="' + adUrl + '"></iframe>',

        viewTTL     = cfg.view_ttl ? ( cfg.view_ttl * 1000 ) : 0,
        isOpen      = false,
        onIf        = false,    // cursor on iframe
        isAttached  = false,
        showCycles  = 0,
        delay       = 0,        // for lazyload bottom time delta
        bottomBuffer= 2000,

        removeOp    = function(err){
            if ( cfg.user_pause_ttl ){
                Dbg( 'adding user_pause_ttl = ' + cfg.user_pause_ttl );
                cookie.pauseUntil = currTime + cfg.user_pause_ttl; 
                writeCookie(cookieName,cookie);
            }
            Dbg( 'removeOp fires');
            window.clearTimeout(timeoutId);
            $(ar).remove();
            onIf = false;
            cfOwl.dispatch( {action: err? err : 'close', orient: orient, c: cVal, ext_inv_code: ext_inv_code, placement_id: placement_id });
        },

        maximizeOp = function(){
            $(fr).css( { width: '300px' });
            $(ar).animate( { width: fullWidth } , 'slow', function() { 
                Dbg( 'maximizeOp ');
                $(xr).html('x');
                $(xr).unbind('click').click( removeOp );
                showCycles++;
                // do we allow it to minimize again?  do we go longer later? 
                Dbg( showCycles + ' showCycles; installing setTimeout for minimizeOp; viewTTL='+viewTTL );
                $(ar).unbind('hover').hover( function(){ onIf = true; }, function(){ onIf = false; } );
                isOpen = true;
                timeoutId = window.setTimeout( minimizeOp, viewTTL );
            });
        },

        minimizeOp = function(){
            Dbg( 'starting minimizeOp (rollback)' );
            if (!  $(ar).length ) { 
                Dbg( '--bailing out of minimizeOp -- element was removed' );
                return;                 // element has been removed via close click
            }
            if ( onIf ){ 
                Dbg('-- bailing out of minimizeOp; hover cancels and reschedules' );
                timeoutId = window.setTimeout( minimizeOp, viewTTL );
                return;
            }

            $(fr).animate( { width: '22px' } , 'slow', function(){ 
                Dbg( 'installing hover handler....' );
                $(ar).css('width','32px');
                $(xr).html( isLeft ? '>' : '<' );
                $(xr).unbind('click').click( maximizeOp );
                $(ar).unbind('hover').hover( function(){ onIf = true; maximizeOp(); }, function(){ onIf = false; }  );
            });
        },

        frLoad  = function(){
            var H =  $(fr).contents().find("html").height();

            Dbg("frame content is ready(?); dispatching owl viewTTL=" + viewTTL  +" height=" + H + " src=" + $(fr).prop('src') );

            if (H === null || H < 1 ){
                return removeOp('cancel_empty');
            }

            if (viewTTL) { 
                window.setTimeout( minimizeOp, viewTTL );
             }

            $(ar).delay(1600).animate( { width: fullWidth }, tx );
            $(xr).click( removeOp );
            cfOwl.dispatch( { action: 'load', orient: orient, c: cVal, delay: delay, ext_inv_code: ext_inv_code, placement_id: placement_id });

            $(ar).hover( function(){ onIf = true; }, function(){ onIf = false; } );

            $(window).blur( function() {
                Dbg( "  BLUR EVENT click=" + onIf  );
                if( onIf ) {
                    cfOwl.dispatch( {action: 'click', orient: orient, c: cVal, ext_inv_code: ext_inv_code, placement_id: placement_id  });
                }
            }); 

        },
        attach = function(){
            Dbg( "attach() is running after t delta=" + ( currTs() - currTime ) );

            $('head').append(  '<style type="text/css">' + css + '</style>' );
            $('<div/>').attr('id', a).appendTo('body');
            $('<div/>').attr('id', b).html(iframe).appendTo(ar);
            $('<span>x</span>').attr('id',x).appendTo(br);

            $(ar).addClass( isLeft ? 'cfad-l' : 'cfad-r' ); 
            $(fr).addClass( isLeft ? 'cfadf-l' : 'cfadf-r' );
            $(xr).addClass( isLeft ? 'cfadx-l' : 'cfadx-r' );
 
            if ( useScroll )   $(ar).css('position', 'fixed');

            if ( isBottom ){ 
                if ( useScroll ){  
                    $(ar).addClass('cfad-y-bot');  
                }else{
                    $(ar).css('top', $(document).height() - 300 );
                }
            }else{
                $(ar).addClass('cfad-y-top');
            }
           isAttached = true;
           $(fr).on("load", frLoad);
        },

        sinceLast   = currTime,   // debug only
        timex       = null,
        scrollWatch = function(){
            if (timex) window.clearTimeout(timex);
            timex = window.setTimeout( function(){
                timex = null;

                if (isAttached)  {
                    Dbg( "scrollWatch about to be destroyed .... "  );
                    $(window).off('scroll', scrollWatch);
                    return;
                }
                var end     = $(document).height(),
                    at      =  $(window).height() + $(window).scrollTop(),
                    toEnd   = end - at,
                    since   = +(new Date()) / 1000;

                Dbg( 'scrollWatch end=' + end + ' at=' + at + ' distance toEnd=' + toEnd + ' since=' + (since - sinceLast) );
                sinceLast = since;
                if ( toEnd <= bottomBuffer ){ 
                    delay =  currTs() - currTime;
                    $(ar).show();
                    attach();
                }
            }, 70);
        };

    Dbg( "vars were set: isLeft=" + isLeft + ' isBottom=' + isBottom +  ' useScroll='+useScroll);

    $(document).ready(function(){
        if ( isBottom ){ 
            var currPos = $(window).height() + $(window).scrollTop();
            Dbg( "checking curr_pos=" + currPos  + " and doc.height=" + $(document).height() );

            if ( currPos > ( $(document).height() - bottomBuffer) ) {
                Dbg( "skipping scrollWatch handler; already within range at curr_pos=" + currPos );
                attach();
            }
            else{
                Dbg( "installing scrollWatch handler; doc_size=" + $(document).height() + " curr_pos=" + currPos );
                $(window).on('scroll', scrollWatch );
            }
        }else{
            attach(); 
        }
    });

    Dbg('caddi code complete' );

} );
