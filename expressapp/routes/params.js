var express = require('express');
const { BrowserWindow, webContents} = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');
const _ = require('lodash');
const { resetExampleWindows, addExampleWindows } = require('./index');

// Update params for current file
router.put('/update/', function(req, res, next) {
    const updatedParamCodeString = req.body.updatedParamCodeString;
    console.log("updatedParamCodeString", updatedParamCodeString);
    // Using try/finally to make sure we don't proceed if JSON.parse fails
        // (i.e., if string isn't completed code, like person was still typing)
        // Shouldn't update db entry or make any window changes if param code isn't valid
    let newParamSetList;
    try{
        newParamSetList = _.uniqWith(JSON.parse(updatedParamCodeString), _.isEqual);
        console.log("newParamSetList", newParamSetList);
    }catch{
        res.end();
        return;
    }
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                paramCodeString: updatedParamCodeString,
                lastModified: Date.now()
            }
        },
        function(error, result){
            req.app.locals.filesCollection.find({
                fileID: req.app.locals.fileID
            }).toArray(function(error, docs){
                // Only create windows if a startingUrl exists
                if(docs[0].startingUrl){
                    // Compare to what's in req.app.locals.windowMetadata
                    const oldParamSetList = _.uniqWith(getOldParamSetList(req), _.isEqual);
                    //console.log("oldParamSetList", oldParamSetList);

                    const paramSetsRemoved = _.differenceWith(oldParamSetList, newParamSetList, _.isEqual);
                    //console.log("paramSetsRemoved", paramSetsRemoved);
                    const paramSetsAdded = _.differenceWith(newParamSetList, oldParamSetList, _.isEqual);
                    //console.log("paramSetsAdded", paramSetsAdded);
                    if(paramSetsAdded.length === 0 && paramSetsRemoved.length === 0){
                        console.log("No changes");
                        res.end();
                    }else if(paramSetsAdded.length >= paramSetsRemoved.length){
                        // Can reuse existing windows and replace param sets
                        let i;
                        for(i = 0; i < paramSetsRemoved.length; i++){
                            // For each param set that's removed, take one from paramSetsAdded to replace it with in an example window
                            const removedParamSet = paramSetsRemoved[i];
                            // Find removedParamSet in req.app.locals.windowMetadata; replace it with a new param set, and update page/border BrowserViews appropriately
                            for (const item of Object.entries(req.app.locals.windowMetadata)) {
                                const pageWinID = item[0];
                                //console.log("item[1]", item[1]);
                                //console.log("item[1].correspondingBorderWinID", item[1].correspondingBorderWinID);
                                const borderWinID = item[1].correspondingBorderWinID;
                                const oldParamSet = item[1].parameterValueSet;
                                if(_.isEqual(removedParamSet, oldParamSet)){
                                    // Replace removedParamSet with one in paramSetsAdded
                                    const newParamSet = paramSetsAdded[i];
                                    req.app.locals.windowMetadata[pageWinID].parameterValueSet = newParamSet;

                                    const paramString = JSON.stringify(newParamSet);
                                    // Update page/border BrowserViews appropriately
                                    webContents.fromId(borderWinID).send("updateParameters", paramString);
                                    // Update paramsets listed in dropdown menu
                                    req.app.locals.windowSelectionView.webContents.send("updateParameters", pageWinID, paramString);
                                }
                            }
                        }

                        // Add necessary windows for extra param sets
                        if(paramSetsAdded.length > paramSetsRemoved.length){
                            // At this point we have replaced all removed param sets,
                            // so now we need to add new windows (and targets) for
                            // the remaining param sets in paramSetsAdded
                            addExampleWindows(req, paramSetsAdded.slice(i));
                        }
                        res.end();
                    }else{
                        // paramSetsAdded.length < paramSetsRemoved.length
                        // We're going to have to remove windows, which unfortunately means we have to just
                            // clear all existing windows and start from scratch

                        req.app.locals.filesCollection.find({
                            fileID: req.app.locals.fileID
                        }).toArray(function(error, docs){
                            resetExampleWindows(req, docs[0].startingUrl);
                            res.end();
                        });
                    }
                }else{
                    res.end();
                }
            });
        }
    );
});

router.post('/getCurrentParamCodeString/', function(req, res, next) {
    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        res.send(docs[0].paramCodeString);
    });
});

const getOldParamSetList = function(req){
    let oldParamSetList = [];
    for(let key in req.app.locals.windowMetadata){
        let value = req.app.locals.windowMetadata[key];
        parameterValueSet = value.parameterValueSet;
        oldParamSetList.push(parameterValueSet);
    }
    return oldParamSetList;
};

module.exports = {
    router
};