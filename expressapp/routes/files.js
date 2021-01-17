var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

// Update file name for current file
router.post('/updateName', function(req, res, next) {
    console.log("updateName started");
    const updatedFileName = req.body.updatedFileName;
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileName: updatedFileName,
                lastModified: Date.now()
            }
        },
        function(error, result){
            console.log("updateName finished");
            res.end();
        }
    );
});

router.post('/showFile/:fileID', function(req, res, next) {
    const newFileIDToShow = req.params.fileID;

    // To be safe, make sure to update current file name and contents before
        // rendering this different file
    const currentFileName = req.body.currentFileName;
    const currentFileContents = req.body.currentFileContents;
    const currentParamCodeString = req.body.currentParamCodeString;
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileName: currentFileName,
                fileContents: currentFileContents,
                paramCodeString: currentParamCodeString,
                lastModified: Date.now()
            }
        },
        function(error, result){
            // Maybe just re-render fileSelection template entirely and send
                // back over to client to just replace
            req.app.locals.filesCollection.find().toArray(function(error2, docs){
                let fileIDNamePairs = [];
                // Add all pairs to the list
                for(let i = 0; i < docs.length; i++){
                    // Include all files in dropdown menu except for the one we're going to show
                    if(docs[i].fileID !== newFileIDToShow){
                        fileIDNamePairs.push({
                            fileID: docs[i].fileID,
                            fileName: docs[i].fileName
                        });
                    }
                }

                req.app.locals.fileID = newFileIDToShow;

                req.app.locals.filesCollection.find({fileID: newFileIDToShow}).toArray(function(error3, fileDocs){
                    const fileToShowObj = fileDocs[0];
                    const fileName = fileToShowObj.fileName;
                    const fileContents = fileToShowObj.fileContents;
                    const paramCodeString = fileToShowObj.paramCodeString;

                    // Now need to send back
                        // the new file selection rendering,
                        // the current file code
                    res.render('partials/fileSelection', {
                        currentFileName: fileName,
                        fileIDNamePairs: fileIDNamePairs,
                        "layout": false
                    }, function (error4, fileSelectionHtml) {
                        res.json({
                            fileSelectionHtml: fileSelectionHtml,
                            fileContents: fileContents,
                            paramCodeString: paramCodeString
                        });
                    });
                });
            });
        }
    );
});

router.post('/createNewFile', function(req, res, next) {
    // To be safe, make sure to update current file name and contents before
        // creating (and rendering) new file
    const currentFileName = req.body.currentFileName;
    const currentFileContents = req.body.currentFileContents;
    const currentParamCodeString = req.body.currentParamCodeString;
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileName: currentFileName,
                fileContents: currentFileContents,
                paramCodeString: currentParamCodeString,
                lastModified: Date.now()
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
                    fileContents: "// Write your script here\n",
                    paramCodeString: `const listOfParamSets = [
    /*{
        <param1>: <valA>,
        <param2>: <valB>
    },
    ...*/
];`,
                    lastModified: Date.now()
                };
                req.app.locals.filesCollection.insertOne(fileObj);


                // Now need to send back
                    // the new file selection rendering,
                    // the current file code
                res.render('partials/fileSelection', {
                    currentFileName: fileObj.fileName,
                    fileIDNamePairs: fileIDNamePairs,
                    "layout": false
                }, function (error4, fileSelectionHtml) {
                    res.json({
                        fileSelectionHtml: fileSelectionHtml,
                        fileContents: fileObj.fileContents,
                        paramCodeString: fileObj.paramCodeString
                    });
                });
            });
        }
    );
});

// Delete currently open file
router.delete('/delete', function(req, res, next) {
    // Delete this file
    req.app.locals.filesCollection.deleteOne({fileID: req.app.locals.fileID}, function(){
        // If other files still exist, show the most recently modified one
        // If no other files exist, create a new empty file

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
                    fileContents: "// Write your script here\n",
                    paramCodeString: `const listOfParamSets = [
    /*{
        <param1>: <valA>,
        <param2>: <valB>
    },
    ...*/
];`,
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

            res.render('partials/fileSelection', {
                currentFileName: fileObj.fileName,
                fileIDNamePairs: fileIDNamePairs,
                "layout": false
            }, function (error4, fileSelectionHtml) {
                res.json({
                    fileSelectionHtml: fileSelectionHtml,
                    fileContents: fileObj.fileContents,
                    paramCodeString: fileObj.paramCodeString
                });
            });

        });
    });
});

module.exports.router = router;
module.exports = {
    router
};