var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

// Update file name for current file
router.post('/updateName/', function(req, res, next) {
    console.log("updateName started");
    const updatedFileName = req.body.updatedFileName;
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileName: updatedFileName
            }
        },
        function(error, result){
            console.log("updateName finished");
            res.end();
        }
    );
});

/*router.post('/renderDifferentFile/:fileID', function(req, res, next) {
    const fileID = req.params.fileID;

});*/

router.post('/createNewFile', function(req, res, next) {
    // To be safe, make sure to update current file name and contents before
        // creating (and rendering) new file
    const currentFileName = req.body.currentFileName;
    const currentFileContents = req.body.currentFileContents;
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileName: currentFileName,
                fileContents: currentFileContents
            }
        },
        function(error, result){
            // Maybe just re-render fileSelection template entirely and send
                // back over to client to just replace
            req.app.locals.filesCollection.find().toArray(function(error2, docs){
                let fileIDNamePairs = [];
                // Add all pairs to the list
                for(let i = 0; i < docs.length; i++){
                    fileIDNamePairs.push({
                        fileID: docs[i].fileID,
                        fileName: docs[i].fileName
                    });
                }

                // Create new file obj
                req.app.locals.fileID = uuidv1();
                // Insert new entry into DB
                fileObj = {
                    fileID: req.app.locals.fileID,
                    fileName: "untitled_" + req.app.locals.fileID + ".js",
                    fileContents: "",
                    lastModified: Date.now()
                };
                req.app.locals.filesCollection.insertOne(fileObj);

                res.render('partials/fileSelection', {
                    currentFileName: fileObj.fileName,
                    fileIDNamePairs: fileIDNamePairs
                });
            });
        }
    );
});

module.exports.router = router;
module.exports = {
    router
};