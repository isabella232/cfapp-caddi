
CloudFlare.define( 'caddi', [       'caddi/config', 'cloudflare/dom',   'cloudflare/user',  'cloudflare/owl',       'cloudflare/jquery1.7',     'cloudflare/console' ], 
                            function(cfg,           dom,                user,               owl,                    jQuery,                     console) {

    var $ = jQuery; 

    /* config vars:
     *  text_only       [ 0  | 1 ]
     *  scroll          [ 0 | 1 ]
     *  debug           [ 1 | 0 ]
     *  user_pause_ttl  [ -1 | 0 | INT ] seconds
     *  orient          [ left | right | left_bottom | right_bottom ]
     *  ss_view_max_ct  [ 0 | INT ]
     *  view_ttl        [ 0 | INT ]  seconds; but used in MS timer
     *  min_resolution  [ 0 | 1024x0 | 1600x0 ]
     *
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
        httpOnly    = parseInt( cfg.http_only, 10 ) || 1,
        sectionId   = ( cfg.text_only ) ? parseInt(cfg.LYRM_id, 10) ||  '3612448' : parseInt(cfg.LYRM_id, 10) || '3612448',
        V           = cfg.version || '0.5.5',
        D           = cfg.debug || 1,
        cVal        = '',

        installCookie = function(name,val,ttl) {
            var exp = new Date();
            if ( ttl ) { 
                exp.setTime( exp.getTime() + (ttl * 1000) );
            }
            D  &&  console.log( 'installCookie name=' + name + ' val=' + val );
            document.cookie = name + "=" + val + (ttl ? ";expires=" + exp.toUTCString() : '' );
        }, 
    
        readCookieAttrs = function(str) {
            var C = {},
                arr = str ? str.split(delim) : [];
            D  &&  console.log( "readCookieAttrs starts on str", str, arr );

            for ( i = 0; i < cookieCol.length; i++ ){ 
                C[ cookieCol[i] ] = arr[i]  ? parseInt(arr[i], 10) : 0;
            }
            D  &&  console.log( "finish loop", C );
            ( C.timeFirst && parseInt(C.timeFirst, 10) && C.timeFirst > 1354151978 )  || ( C.timeFirst  = currTime );
            D  &&  console.log( "finish timeset" );
            if ( ! C.sessionStart ) C.sessionStart = currTime;

            D  &&  console.log( "readCookieAttrs returns", C );
            return C;
        },

        writeCookie = function(cName, C, ttl){ 
            var vals = [];
            for ( i = 0; i < cookieCol.length; i++){ 
                vals.push( C[cookieCol[i]] || 0);
            }
            cVal    = vals.join(delim);
            installCookie( cName, cVal, ttl );
        },

        orient      = cfg.orient || 'left',
        isLeft      = orient.indexOf('left') >= 0   ? true : false,
        isBottom    = orient.indexOf('bottom') >= 0 ? true : false,
        useScroll   = ( parseInt(cfg.scroll, 10) || isBottom ) ? 1 : 0,
        minRes      = ( cfg.min_resolution && cfg.min_resolution.indexOf('x') > 0 ) ?  cfg.min_resolution.split('x') : null,

        cookieName  =  'cfapp_caddi',
        cookie      =  readCookieAttrs( user.getCookie(cookieName) ),
        inSession   = (( currTime - cookie.sessionStart ) < sessionTTL ) ? 1 : 0,
        viewport    = dom.getViewport(),
        terminate   = false; 

    /*
     * logic: eligibility, cookie, etc.
     */
    D  &&  console.log( "caddi starts; version="+V+"config:", cfg );

    cookie.N++;

    if (dom.ios || dom.android ){ 
        terminate++;
    }
    if ( httpOnly &&  window.location.protocol === 'https:' ){
        terminate++;
        D  &&  console.log( "httpOnly; terminate="+terminate);
    }
    if (window.cf_slider_disable ){
        terminate++;
    }

    if(  minRes && viewport ) {
        ( minRes[0] && viewport.width ) && ( minRes[0] <= viewport.width || terminate++ );
        ( minRes[1] && viewport.height ) && ( minRes[1] <= viewport.height || terminate++ );
        D  &&  console.log( "minRes check; terminate=" + terminate, minRes, viewport );
    }
    
    if( cookie.pauseUntil && cookie.pauseUntil >= currTime ){
        cookie.pauseSkipCt++;
        terminate++;
        D  &&  console.log( 'Ad serving is paused; seconds left=' + ( cookie.pauseUntil - currTime ) );
    }
    else if ( cookie.pauseUntil !== 0  ) {
        D  &&  console.log( 'Ad serving was paused; but active again.  Removing cookie setting? ' + cookie.pauseUntil );
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
        D   &&  console.log( 'TERMINATE; val='+ terminate );
        return;
    }

    var cfOwl           = owl.createDispatcher('caddi');

    D  &&  console.log( 'owl created cfOwl' , cfOwl );

    /* 
     * create HTML
     */

    var a = 'cfad',     // id="cfad"
        ar = '#'+a,     // reference of id;  #cfad
        b   = a + 'b',
        br  = '#'+b,
        x   = a + 'x',  // x=close
        xr  = '#'+x,
        f   = a + 'f',  // f=frame
        fr  = '#'+f,
        tx  = 1000,     // slider slide time
        fullWidth   = '310px',
        iframe  = '<iframe id="'+f+'" FRAMEBORDER=0 MARGINWIDTH=0 MARGINHEIGHT=0 SCROLLING=NO WIDTH=300 HEIGHT=250 SRC="//ad.yieldmanager.com/st?ad_type=iframe&ad_size=300x250&section=' + 
                sectionId + '&pub_url=' + escape(location.href)  + '"></IFRAME>',
        css = 
                ' #cfad  { height: 280px; width:0px; padding: 2px 0; position: absolute; z-index: 99999; line-height: 1px; overflow: hidden; } ' + 
                ' #cfadb  { position:relative }' + 
                ' #cfadf { height: 250px; width: 300px; margin: 0px; padding: 3px; background-color: #ffffff; border: 1px solid #404040; } ' +
                ' #cfadx { background-color: #ffffff; margin-top: -1px; color: #404040; font-weight: bold; font: 16px Helvetica,Arial,Sans-serif; padding: 0px 5px 0.6px 4px; text-decoration: none; border: 0; border-bottom:  1px solid #404040; position: absolute; display: block; } ' + 
                ' .cfad-l { left: 0px; } .cfad-r { right: 0px; text-align:right}  ' + 
                ' .cfadf-l { border-left: 0px ! important; } .cfadf-r { border-right:0px ! important; } ' + 
                ' .cfadx-l { border-right: 1px solid #404040 ! important; left : 0 ! important; } .cfadx-r { border-left:  1px solid #404040 ! important; right: 0 ! important; } ' + 
                ' .cfad-y-bot { bottom: 15px; } ' + 
                ' .cfad-y-top { top: 15px; } ' ; 

    D  &&  console.log( "vars were set: isLeft=" + isLeft );

    $('head').append(  '<style type="text/css">' + css + '</style>' );

    $('<div/>').attr('id', a).appendTo('body');
    $('<div/>').attr('id', b).html(iframe).appendTo(ar);
    $('<span>x</span>').attr('id',x).appendTo(br);

    $(ar).addClass( ( isLeft ? 'cfad-l' : 'cfad-r') +  ' ' + ( isBottom ? 'cfad-y-bot' : 'cfad-y-top' ) );
    $(fr).addClass( isLeft ? 'cfadf-l' : 'cfadf-r' );
    $(xr).addClass( isLeft ? 'cfadx-l' : 'cfadx-r' );

    if ( useScroll )   $(ar).css('position', 'fixed');

    var timeoutId   = null,
        viewTTL     = cfg.view_ttl ? ( cfg.view_ttl * 1000 ) : 0,
        isOpen      = false,
        onIf        = false,  // cursor on iframe
        showCycles  = 0,
        removeOp    = function(){ 
            if ( cfg.user_pause_ttl ){
                D  &&  console.log( 'adding user_pause_ttl = ' + cfg.user_pause_ttl );
                cookie.pauseUntil = currTime + cfg.user_pause_ttl; 
                writeCookie(cookieName,cookie);
            }
            window.clearTimeout(timeoutId);
            $(ar).remove();
            onIf = false;
            cfOwl.dispatch( {action: 'close', orient: orient, c: cVal });
        },

        maximizeOp = function(){
            $(fr).css( { width: '300px' });
            $(ar).animate( { width: fullWidth } , 'slow', function() { 
                D  &&  console.log( 'maximizeOp ');  
                $(xr).html('x');
                $(xr).unbind('click').click( removeOp );
                showCycles++;
                // do we allow it to minimize again?  do we go longer later? 
                D  &&  console.log( showCycles + ' showCycles; installing setTimeout for minimizeOp; viewTTL='+viewTTL );
                $(ar).unbind('hover').hover( function(){ onIf = true; }, function(){ onIf = false; } );
                isOpen = true;
                timeoutId = setTimeout( minimizeOp, viewTTL );
            });
        },

        minimizeOp = function(){ 
            D  &&  console.log( 'starting minimizeOp (rollback)' );
            if (!  $(ar).length ) { 
                D  &&  console.log( '--bailing out of minimizeOp -- element was removed' );
                return;                 // element has been removed via close click
            }
            if ( onIf ){ 
                D  &&  console.log('-- bailing out of minimizeOp; hover cancels and reschedules' );
                timeoutId = setTimeout( minimizeOp, viewTTL );
                return;
            }        

            $(fr).animate( { width: '22px' } , 'slow', function(){ 
                D  &&  console.log( 'installing hover handler....' );
                $(ar).css('width','32px');
                $(xr).html( isLeft ? '>' : '<' );
                $(xr).unbind('click').click( maximizeOp );
                $(ar).unbind('hover').hover( function(){ onIf = true; maximizeOp(); }, function(){ onIf = false; }  );
            });
             
        };


    $(fr).on("load", function() {

        D  &&  console.log( "  frame content is ready; dispatching owl viewTTL=" + viewTTL );

        if (viewTTL) { 
            window.setTimeout( minimizeOp, viewTTL );
         }

        $(ar).delay(1600).animate( { width: fullWidth }, tx );
        $(xr).click( removeOp );
        
        cfOwl.dispatch( { action: 'load', orient: orient, c: cVal });

        $(ar).hover( function(){ onIf = true; }, function(){ onIf = false; } );

        $(window).blur( function() {
            D  &&  console.log( "  BLUR EVENT click=" + onIf  );
            if( onIf ) {
                cfOwl.dispatch( {action: 'click', orient: orient, c: cVal });
            }
        }); 
    });

    D  &&  console.log('caddi code complete' );

} );

