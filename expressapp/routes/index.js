var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

/* GET home page. */
router.get('/', function(req, res, next) {

    // Check DB for existing files
    // If no existing files, create a new one
    req.app.locals.filesCollection.find().sort( { lastModified: -1 } ).toArray(function(error, docs){
        let fileObj;
        if(docs.length > 0){
            // There are existing files
            // Choose the one that was most recently edited (i.e., the first one in this sorted list)
            fileObj = docs[0];
            req.app.locals.fileID = fileObj.fileID;
            console.log("mostRecentlyModifiedFileObj", fileObj);
        }else{
            // No existing files, create a new one
            req.app.locals.fileID = uuidv1();
            // Insert new entry into DB
            fileObj = {
                fileID: req.app.locals.fileID,
                fileName: "untitled_" + req.app.locals.fileID + ".js",
                fileContents: "",
                lastModified: Date.now()
            };
            req.app.locals.filesCollection.insertOne(fileObj);
        }

        // Create pairs of file IDs and names
        let fileIDNamePairs = [];
        // Add all pairs to the list (except for the first one which is actually being shown)
        for(let i = 1; i < docs.length; i++){
            fileIDNamePairs.push({
                fileID: docs[i].fileID,
                fileName: docs[i].fileName
            });
        }
        console.log("fileIDNamePairs", fileIDNamePairs);

        // Now render appropriately
        res.render('layouts/index', {
            currentFileID: fileObj.fileID,
            currentFileName: fileObj.fileName,
            currentFileContents: fileObj.fileContents,
            fileIDNamePairs: fileIDNamePairs,
            routesRoot: __dirname // e.g., /Users/rkros/Desktop/desktop/PhD/web_automation/expressapp/routes
        });
    });
});

router.get('/border', function(req, res, next) {
    res.render('layouts/border');
});

module.exports.router = router;
module.exports = {
    router
};