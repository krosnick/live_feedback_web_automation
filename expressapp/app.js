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

    const editorBrowserView = new BrowserView({webPreferences: {zoomFactor: 1.0, nodeIntegration: true, webSecurity: false} });
    console.log("editorBrowserView ID", editorBrowserView.webContents.id);
    win.addBrowserView(editorBrowserView);
    editorBrowserView.setBounds({ x: 0, y: 0, width: 780, height: 950 });
    editorBrowserView.webContents.loadURL('http://localhost:3000/');
    editorBrowserView.webContents.openDevTools({mode: "detach"});


    // The different sets of parameter values we're testing;
    // for now we'll hard-code here, so that we have some test cases and can create
    // BrowserView windows for them. In the future we'll create BrowserView windows
    // on-demand based on user or system provided test cases
    // Format?: [{ <param1>: <val1>, <param2>: <val1> }, { <param1>: <val2>, <param2>: <val2> }]
    const parameterValueSets = [ {1: "Home & Kitchen",  2: "can opener"}, {1: "Arts, Crafts & Sewing", 2: "colored pencils"} ];

    // Final format we want?: { <exampleWinID1>: { correspondingBorderWinID: , parameterValueSet: { <param1>: <val>, <param2>: <val> } } }
    // Create BrowserView windows and populate appropriately based on parameterValueSets
    expressApp.locals.windowMetadata = {};

    //for(paramSet of parameterValueSets){
    for(let i = 0; i < parameterValueSets.length; i++){
        const paramSet = parameterValueSets[i]
        // Create a BrowserView to contain the actual website, and then create a background border BrowserView
        const borderView = new BrowserView({webPreferences: {nodeIntegration: true } });
        win.addBrowserView(borderView);
        //borderView.setBounds({ x: 780, y: 0, width: 940, height: 470 });
        borderView.setBounds({ x: 780, y: i*500, width: 920, height: 530 });
        borderView.webContents.loadURL('http://localhost:3000/border');
        borderView.webContents.executeJavaScript(`
            const { ipcRenderer } = require('electron');
            ipcRenderer.on('errorMessage', function(event, message){
                console.log('errorMessage occurred');
                document.querySelector('#borderElement').classList.add('errorBorder');
                document.querySelector('#errorMessage').textContent = message;
            });
            ipcRenderer.on('clear', function(event){
                console.log('clear occurred');
                document.querySelector('#borderElement').classList.remove('errorBorder');
                document.querySelector('#errorMessage').textContent = "";
            });
        `);
        borderView.webContents.openDevTools({mode: "detach"});

        const pageView = new BrowserView({webPreferences: {zoomFactor: 0.5, nodeIntegration: true, webSecurity: false } });
        win.addBrowserView(pageView);
        //pageView.setBounds({ x: 800, y: 0, width: 900, height: 450 });
        pageView.setBounds({ x: 800, y: (i*500 + 30), width: 860, height: 450 });
        pageView.webContents.loadURL('https://www.amazon.com');
        pageView.webContents.openDevTools();

        // Store metadata in this global object
        expressApp.locals.windowMetadata[pageView.webContents.id] = {
            correspondingBorderWinID: borderView.webContents.id,
            parameterValueSet: paramSet
        };
    }


    /*const border1 = new BrowserView();
    win.addBrowserView(border1);
    border1.setBounds({ x: 780, y: 0, width: 940, height: 470 });
    border1.webContents.loadURL('http://localhost:3000/border');

    const pageView1 = new BrowserView({webPreferences: {zoomFactor: 0.5, nodeIntegration: true, webSecurity: false } });
    console.log("pageView1 ID", pageView1.webContents.id);
    //console.log("view1 ID", view1.webContents.getProcessId());
    win.addBrowserView(pageView1);
    pageView1.setBounds({ x: 800, y: 0, width: 900, height: 450 });
    pageView1.webContents.loadURL('https://www.amazon.com');
    pageView1.webContents.openDevTools();

    const pageView2 = new BrowserView({webPreferences: {zoomFactor: 0.5, nodeIntegration: true, webSecurity: false } });
    console.log("pageView2 ID", pageView2.webContents.id);
    win.addBrowserView(pageView2);
    pageView2.setBounds({ x: 800, y: 500, width: 900, height: 450 });
    pageView2.webContents.loadURL('https://www.amazon.com');
    pageView2.webContents.openDevTools();*/


    setupPuppeteer();
    /*// and load the index.html of the app.
    win.loadURL('http://localhost:3000/');

    // Open the DevTools.
    win.webContents.openDevTools();*/

    // wait for the window to open/load, then connect Puppeteer to it:
    /*win.webContents.on("did-finish-load", () => { 
    console.log("did-finish-load");
    setupPuppeteer();
    });*/

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    });

    // Capturing the window ID, so that later in router files we can send messages to a particular window
    expressApp.locals.browserWinIDs["win"] = win.id;
    expressApp.locals.editorBrowserView = editorBrowserView;
    //expressApp.locals.numBrowserWindows = 2;
    expressApp.locals.win = win;
    /*expressApp.locals.view1 = view1;
    expressApp.locals.view2 = view2;*/
    // This prints out "1" as long as win is the first window created
    //console.log("win.id");
    //console.log(win.id);

    win.focus();
    win.webContents.debugger.attach();
}

module.exports = expressApp;