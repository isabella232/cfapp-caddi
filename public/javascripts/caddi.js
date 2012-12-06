

CloudFlare.define( 'caddi', 
    [       'caddi/config', 'cloudflare/dom',   'cloudflare/user',  'cloudflare/owldev',   'cloudflare/jquery1.7' ], 
    function(cfg,           dom,                user,               owl,                    jQuery ) {

    var $ = jQuery;

    var section_id  = '3628055';    // default: static+video  
    if ( cfg && cfg.text_only ){ 
        section_id = '3628054';    // static only
    }
 
    /* config vars:
     *  text_only       [ 0  | 1 ]
     *  orient          [ left | right | left_bottom | right_bottom ]
     *  user_pause_ttl  [ -1 | 0 | INT ]
     *  scroll          [ 0 | 1 ]
     *  ss_view_max_ct  [ 0 | INT ]
     *  min_resolution  [ 0 | 1024x0 | 1600x0 ]
     *  debug           [ 1 | 0 ]
     */

    /*
     * setup vars
     */

    var delim       = '|',
        sessionTTL  = 1200,
        cookieCol   = ['timeFirst','sessionStart','N','sessionCt','sessionViewCt','pauseUntil','pauseSkipCt','impCt'],
        currTs      = function() { return parseInt( +(new Date) / 1000 ) },
        currTime    =  currTs(),
        fadeInDelay = 1200,
        rollbackTTL = 60000,
        D           = cfg.debug || 1,

        installCookie = function(name,val,ttl) {
            if ( ttl ) { 
                var exp = new Date();
                exp.setTime( exp.getTime() + (ttl * 1000) );
            }
            D  &&  console.log( 'installCookie name=' + name + ' val=' + val );
            document.cookie = name + "=" + escape(val) + (ttl ? ";expires=" + exp.toUTCString() : '' );
        }, 
    
        readCookieAttrs = function(str) {
            var C = {},
                arr = str ? str.split(delim) : [];
            D  &&  console.log( "readCookieAttrs starts on str", str, arr );

            for ( i = 0; i < cookieCol.length; i++ ){ 
                C[ cookieCol[i] ] = arr[i] || 0;
            }
            D  &&  console.log( "finish loop", C );
            ( C.timeFirst && parseInt(C.timeFirst) && C.timeFirst > 1354151978 )  || ( C.timeFirst  = currTime );
            D  &&  console.log( "finish timeset" );
            C.sessionStart || ( C.sessionStart = currTime );
            D  &&  console.log( "readCookieAttrs returns", C );
            return C;
        },

        writeCookie = function(cName, C, ttl){ 
            var vals = [];
            for ( i = 0; i < cookieCol.length; i++){ 
                vals.push( C[cookieCol[i]] || 0);
            }
            installCookie( cName, vals.join(delim), ttl );
        };

        orient      = cfg.orient || 'left',
        isLeft      = orient.indexOf('left') >= 0   ? true : false,
        isBottom    = orient.indexOf('bottom') >= 0 ? true : false,
        useScroll   = ( cfg.scroll || isBottom ) ? 1 : 0,
        minRes      = ( cfg.min_resolution ) ?  cfg.min_resolution.split('x') : null,

        cookieName  =  'cfapp_caddi'+section_id,
        cookie      =  readCookieAttrs( user.getCookie(cookieName) ),
        inSession   = (( currTime - cookie.sessionStart ) < sessionTTL ) ? 1 : 0
        viewport    = dom.getViewport();
        terminate   = false; 

    /*
     * logic: eligibility, cookie, etc.
     */
    D  &&  console.log( "caddi starts with cfg", cfg );

    cookie.N++;

    if (dom.ios || dom.android ){ 
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
   

    if ( cfg.ss_view_max_ct && cookie.sessionViewCt >= cfg.ss_view_max_ct){
        terminate++;
    }else{
        cookie.sessionViewCt++;
        cookie.impCt++;
    }

    writeCookie(cookieName,cookie);

    if ( terminate ) { 
        D   &&  console.log( 'TERMINATE' );
        return;
    }

    var cfOwl           = owl.createDispatcher('caddi');

    /* 
     * create HTML
     */

    var a = 'cfad',     // id="cfad"
        ar = '#'+a,     // reference of id;  #cfad
        x   = a + 'x',  // x=close
        xr  = '#'+x,
        f   = a + 'f',  // f=frame
        fr  = '#'+f,
        tx  = 1000,     // slider fade-in time
        iframe  = '<iframe id="'+f+'" FRAMEBORDER=0 MARGINWIDTH=0 MARGINHEIGHT=0 SCROLLING=NO WIDTH=300 HEIGHT=250 SRC="//ad.yieldmanager.com/st?ad_type=iframe&ad_size=300x250&section=' 
                + section_id + '&pub_url=' + escape(location.href)  + '"></IFRAME>',
        css = 
                ' #cfad  { background-color: #ffffff; height: 280px; width:0px; margin-bottom: 25px; padding: 2px 0; position: fixed; z-index: 99999; overflow: hidden; } ' + 
                ' #cfadf { height: 250px; width: 300px; margin: 0px; padding: 3px; background-color: #ffffff; border: 1px solid #404040;  } ' +
                ' #cfadx { background-color: #ffffff; margin-top: -1px; color: #404040; font-weight: bold; font: 16px Helvetica,Arial,Sans-serif; padding: 0px 5px 0.6px 4px; text-decoration: none; border: 0; border-bottom:  1px solid #404040; position: absolute; display: block; } ' + 
                ' .cfad-l { left: 0px; } .cfad-r { right: 0px; text-align:right}  ' + 
                ' .cfadf-l { border-left: 0px ! important; } .cfadf-r { border-right:0px ! important; } ' + 
                ' .cfadx-l { border-right: 1px solid #404040 ! important; left : 0 ! important; } .cfadx-r { border-left:  1px solid #404040 ! important; right: 0 ! important; } ' + 
                ' .cfad-y-bot { bottom: 15px; } ' + 
                ' .cfad-y-top { top: 15px; } ' ; 


    $('head').append(  '<style type="text/css">' + css + '</style>' );

    $('<div/>').attr('id', a).html(iframe).appendTo('body');
    $('<a href="#">x</a>').attr('id',x).appendTo(ar);

    $(ar).addClass( (isLeft ? 'cfad-l' : 'cfad-r') +  ' ' + ( isBottom ? 'cfad-y-bot' : 'cfad-y-top' ) );
    $(fr).addClass( isLeft ? 'cfadf-l' : 'cfadf-r' );
    $(xr).addClass( isLeft ? 'cfadx-l' : 'cfadx-r' );

    if ( ! isBottom && ! cfg.scroll )  $(ar).css('position', 'relative');

    var removeOp = function(){ 
            if ( cfg.user_pause_ttl ){
                D  &&  console.log( 'adding user_pause_ttl = ' + cfg.user_pause_ttl );
                cookie.pauseUntil = currTime + cfg.user_pause_ttl; 
                writeCookie(cookieName,cookie);
            }
            $(ar).remove();
            cfOwl.dispatch( {action: 'close', orient: orient });
        },
        maximizeOp = function(){
            $(ar).animate( { width: '320px' } , 'slow', function() { 
                $(xr).html('x');
                $(xr).unbind('click').click( removeOp );
            });
        };

    $(xr).click( removeOp );

    $(fr).click( function(){ 
            cfOwl.dispatch( {action: 'click', orient: orient });
    });


    /** 
     * setTimeout flow
     *   after N seconds, animate to reduce to gutter, eg. 4px;
     *   attatch listener for hover that fires re-animate to full size
     *
     */

    $(ar).delay(fadeInDelay).animate( { width: '320px' }, tx )

    var timeoutId = null;
    window.setTimeout( function(){  
        D  &&  console.log( 'starting timeout function to rollback ad' );

        if (!  $(ar).length ) { 
            window.clearTimeout(timeoutID);  // element has been removed via close click
            return;
        }
        $(ar).animate( { width: '18px' } , 'slow', function(){ 
            D  &&  console.log( 'installing alternate click handler....' );
            $(xr).html('>');
            $(xr).unbind('click').click( maximizeOp );
        });
    }, rollbackTTL );


    cfOwl.dispatch( { action: 'load', orient: orient });

    D  &&  console.log('caddi display complete; Owl dispatched' );

} );

