const { app, BrowserWindow, BrowserView } = require('electron');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
app.commandLine.appendSwitch('remote-debugging-port', '8315');

async function setupPuppeteer() {
    console.log("before response");
    const response = await fetch(`http://localhost:8315/json/version/`)
    console.log("after response");
    //console.log("response", response);
    const debugEndpoint = await response.json();
    //console.log("debugEndpoints", debugEndpoint);

    await puppeteer.defaultArgs({ devtools: true });
    puppeteerBrowser = await puppeteer.connect({
        browserWSEndpoint: debugEndpoint.webSocketDebuggerUrl,
        defaultViewport: null
    });
    expressApp.locals.puppeteerBrowser = puppeteerBrowser;
    console.log("puppeteerBrowser.targets()", puppeteerBrowser.targets());

    // use puppeteer APIs now!
}

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const fs = require('fs');


const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

var indexRouter = require('./routes/index').router;
var puppeteerRouter = require('./routes/puppeteer').router;
var filesRouter = require('./routes/files').router;
var codeRouter = require('./routes/code').router;
var paramsRouter = require('./routes/params').router;
var windowDataRouter = require('./routes/windowData').router;

let win; // the main content window

let expressApp;

app.on('ready', function() {
    console.log("in ready");
    expressApp = express();

    var handlebars = require('express-handlebars').create({
        layoutsDir: path.join(__dirname, "views/layouts"),
        partialsDir: path.join(__dirname, "views/partials"),
        defaultLayout: 'layout',
        extname: 'hbs',
        helpers: {
            // put all of your helpers inside this object
        }
    });

    expressApp.engine('hbs', handlebars.engine);
    expressApp.set('view engine', 'hbs');
    expressApp.set('views', path.join(__dirname, "views"));

    expressApp.use(logger('dev'));
    expressApp.use(express.json());
    expressApp.use(express.urlencoded({ extended: false }));
    expressApp.use(cookieParser());
    expressApp.use(express.static(path.join(__dirname, 'public')));
    expressApp.use('/jquery', express.static(__dirname + '/../node_modules/jquery/dist/'));
    expressApp.use('/monaco', express.static(__dirname + '/../node_modules/monaco-editor/min/vs/'));
    expressApp.use('/path', express.static(__dirname + '/../node_modules/path/'));

    expressApp.use('/', indexRouter);
    expressApp.use('/puppeteer', puppeteerRouter);
    expressApp.use('/files', filesRouter);
    expressApp.use('/code', codeRouter);
    expressApp.use('/params', paramsRouter);
    expressApp.use('/windowData', windowDataRouter);

    // catch 404 and forward to error handler
    expressApp.use(function(req, res, next) {
        next(createError(404));
    });

    // error handler
    expressApp.use(function(err, req, res, next) {
        // set locals, only providing error in development
        res.locals.message = err.message;
        res.locals.error = req.app.get('env') === 'development' ? err : {};

        // render the error page
        res.status(err.status || 500);
        res.render('layouts/error');
    });

    if(process.argv[2] === "dev"){
        expressApp.locals.devMode = true;
        // i.e., npm start -- dev
        // dev mode - show all dev tools
    }else{
        // i.e., npm start
        // user mode - don't show extraneous dev tools
        expressApp.locals.devMode = false;
    }

    // Connection URL
    // process.argv[2] is the first arg, the shared directory
    /*const mongoKeys = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'atlas.keys.json'), 'utf8'));
    const mongoUsername = mongoKeys.username;
    const mongoPassword = mongoKeys.password;*/
    //const url = "mongodb+srv://" + mongoUsername + ":" + mongoPassword + "@cluster0-jct4v.mongodb.net/test?retryWrites=true&w=majority";
    const url = 'mongodb://localhost:27017';

    // Database Name
    const dbName = 'liveWebAutomationData';

    let db;
    let filesCollection;

    console.log("before MongoClient");
    const client = new MongoClient(url, { useNewUrlParser: true });
    console.log("after MongoClient");
    // Use connect method to connect to the Server
    client.connect(function(err) {
        console.log("after MongoClient connect");
        console.log("err");
        console.log(err);
        assert.equal(null, err);
        console.log("Connected successfully to server");

        db = client.db(dbName);

        filesCollection = db.collection('files');
        // Set this locals property so that we can access the collections
            // from other parts of the app (e.g., within the req object in
            // in request callbacks)
        expressApp.locals.filesCollection = filesCollection;

        expressApp.locals.title = "Live web automation";
        // ------------------------------
        var debug = require('debug')('expressapp:server');
        var http = require('http');

        /**
         * Get port from environment and store in Express.
         */

        var port = normalizePort(process.env.PORT || '3000');
        expressApp.set('port', port);

        /**
         * Create HTTP server.
         */

        var server = http.createServer(expressApp);

        /**
         * Listen on provided port, on all network interfaces.
         */

        server.listen(port);
        server.on('error', onError);
        server.on('listening', onListening);

        /**
         * Normalize a port into a number, string, or false.
         */

        function normalizePort(val) {
            var port = parseInt(val, 10);

            if (isNaN(port)) {
            // named pipe
            return val;
            }

            if (port >= 0) {
            // port number
            return port;
            }

            return false;
        }

        /**
         * Event listener for HTTP server "error" event.
         */

        function onError(error) {
            if (error.syscall !== 'listen') {
            throw error;
            }

            var bind = typeof port === 'string'
            ? 'Pipe ' + port
            : 'Port ' + port;

            // handle specific listen errors with friendly messages
            switch (error.code) {
            case 'EACCES':
                console.error(bind + ' requires elevated privileges');
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(bind + ' is already in use');
                process.exit(1);
                break;
            default:
                throw error;
            }
        }

        /**
         * Event listener for HTTP server "listening" event.
         */

        function onListening() {
            var addr = server.address();
            var bind = typeof addr === 'string'
            ? 'pipe ' + addr
            : 'port ' + addr.port;
            debug('Listening on ' + bind);
        }

        // ------------------------------

        // Capturing the window ID, so that later in router files we can send messages to a particular window
        expressApp.locals.browserWinIDs = {};

        createWindow();
    });

});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});

function createWindow () {
    // Final format we want?: { <exampleWinID1>: { correspondingBorderWinID: , parameterValueSet: { <param1>: <val>, <param2>: <val> } } }
    // Create BrowserView windows and populate appropriately based on parameterValueSets
    expressApp.locals.windowMetadata = {};
    expressApp.locals.targetPageListReady = true;

    // Create the browser window.
    win = new BrowserWindow({
        width: 1700,
        height: 970,
        webPreferences: {
            nodeIntegration: true,
            webviewTag: true,
            webSecurity: false
        }
    });
    expressApp.locals.browserWinIDs["win"] = win.id;
    expressApp.locals.win = win;
    
    const windowSelectionView = new BrowserView({webPreferences: {zoomFactor: 1.0, nodeIntegration: true, webSecurity: false} });
    win.addBrowserView(windowSelectionView);
    windowSelectionView.setBounds({ x: 780, y: 0, width: 780, height: 100 });
    windowSelectionView.webContents.loadURL('http://localhost:3000/windowSelection');
    if(expressApp.locals.devMode){
        windowSelectionView.webContents.openDevTools({mode: "detach"});
    }
    expressApp.locals.windowSelectionView = windowSelectionView;
    expressApp.locals.windowSelectionViewID = windowSelectionView.webContents.id;

    const editorBrowserView = new BrowserView({webPreferences: {zoomFactor: 1.0, nodeIntegration: true, webSecurity: false} });
    console.log("editorBrowserView ID", editorBrowserView.webContents.id);
    win.addBrowserView(editorBrowserView);
    editorBrowserView.setBounds({ x: 0, y: 0, width: 780, height: 950 });
    editorBrowserView.webContents.loadURL('http://localhost:3000/');
    if(expressApp.locals.devMode){
        editorBrowserView.webContents.openDevTools({mode: "detach"});
    }
    expressApp.locals.editorBrowserView = editorBrowserView;
    expressApp.locals.editorBrowserViewID = editorBrowserView.webContents.id;

    const snapshotsBrowserView = new BrowserView({
        webPreferences: {
            zoomFactor: 1.0,
            nodeIntegration: true,
            webSecurity: false,
            enableRemoteModule: true,
            preload: path.join(__dirname, "../expressapp/public/javascript/snapshots/snapshotsViewPreload.js")
        }
    });
    win.addBrowserView(snapshotsBrowserView);
    // Set offscreen for now
    snapshotsBrowserView.setBounds({ x: 780, y: 1000, width: 920, height: 905 });
    //snapshotsBrowserView.setBounds({ x: 800, y: 0, width: 860, height: 820 });
    snapshotsBrowserView.webContents.loadURL('http://localhost:3000/snapshots');
    // Render devtools within app UI, so that users can inspect snapshot DOMs if they want to
    snapshotsBrowserView.webContents.openDevTools({mode: "bottom"});
    expressApp.locals.snapshotsBrowserView = snapshotsBrowserView;
    expressApp.locals.snapshotsBrowserViewID = snapshotsBrowserView.webContents.id;

    setupPuppeteer();

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    });

    // Capturing the window ID, so that later in router files we can send messages to a particular window
    //expressApp.locals.numBrowserWindows = 2;
    /*expressApp.locals.view1 = view1;
    expressApp.locals.view2 = view2;*/
    // This prints out "1" as long as win is the first window created
    //console.log("win.id");
    //console.log(win.id);

    win.focus();
    win.webContents.debugger.attach();
}

module.exports = expressApp;