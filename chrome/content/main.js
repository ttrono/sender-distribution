var senderDist = {

  //================================
  // global variables
  //================================
  inboxList: null,
  mailcount: 0,
  chkBoxStatus: false,

  //================================
  // constant
  //================================
  CHARSET: 'UTF-8',
  RTNCD  : "\r\n",
  FILENAME_LOG    : 'sender-distribution.log',
  FILENAME_MANAGER: 'sender-distribution-manager.txt',
  FILENAME_LIST   : 'sender-distribution-list.txt',

  LOG_DEBUG: "DEBUG",
  LOG_INFO : "INFO",
  LOG_WARN : "WARN",
  LOG_ERROR: "ERROR",

  // change enable or disable by settings editor
  isDebug: false,

  prefb: Components.classes["@mozilla.org/preferences-service;1"]
       .getService(Components.interfaces.nsIPrefBranch),

  propd: Components.classes["@mozilla.org/file/directory_service;1"]
       .getService(Components.interfaces.nsIProperties)
       .get("ProfD", Components.interfaces.nsIFile),

  stbundle: {
    _bundle: Components.classes["@mozilla.org/intl/stringbundle;1"]
          .getService(Components.interfaces.nsIStringBundleService)
           .createBundle("chrome://sender-distribution/locale/sender-distribution.properties"),
    getLocalizedMessage: function(msg) {
      try {
        return this._bundle.GetStringFromName(msg);
      } catch(e) {
        this.logger.writeError("getLocalizedMessage(): " + e);
        return null;
      }
    }
  },

  logger: {
    writeLog : function(level, data) {
      var foStream;
      try {
        var file = Components.classes['@mozilla.org/file/local;1']
              .createInstance(Components.interfaces.nsIFile);
        file.initWithPath(this.propd.path + getFileSeparator() + FILENAME_LOG);
        if (!file.exists()) file.create(file.NORMAL_FILE_TYPE, 0666);

        foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
          .createInstance(Components.interfaces.nsIFileOutputStream);
        // PR_WRONLY | PR_CREATE_FILE | PR_APPEND
        foStream.init(file, 0x02 | 0x08 | 0x10, 0664, 0);

        RTNCD = getCRLF();
        data = getTime(1) + " <" + level + "> " + data + RTNCD;
        foStream.write(data,data.length);
      } catch(e) {
        if (this.isDebug) alert(e);
      } finally {
        if (foStream != null) {
          foStream.close();
        }
      }
    },
    writeDebug : function(data) {
      if (this.isDebug) this.writeLog(LOG_DEBUG, data);
    },
    writeInfo :  function(data) {
      if (this.isDebug) this.writeLog(LOG_INFO, data);
    },
    writeWarn :  function(data) {
      this.writeLog(LOG_WARN, data);
    },
    writeError :  function(data) {
      this.writeLog(LOG_ERROR, data);
    }
  },

  accountManager:
    Components.classes["@mozilla.org/messenger/account-manager;1"]
              .getService(Components.interfaces.nsIMsgAccountManager),


  //================================
  // common function
  //================================
  toBoolean : function(data) {
    return data.toLowerCase() === 'true';
  },

  zeroPadding : function(value, length){
      return ('0000000000' + value).slice(-length);
  },

  getTime : function(pattern) {
    var currDate = new Date();
    var timeMsg = "";
    var year  = currDate.getFullYear();
    var month = zeroPadding(currDate.getMonth() + 1, 2);
    var day   = zeroPadding(currDate.getDate(), 2);
    var hour  = zeroPadding(currDate.getHours(), 2);
    var min   = zeroPadding(currDate.getMinutes(), 2);
    var sec   = zeroPadding(currDate.getSeconds(), 2);
    var msec  = zeroPadding(currDate.getMilliseconds(), 3);

    if (pattern == 1) {
      // For logging time
      timeMsg = year+"/"+month+"/"+day+" "+hour+":"+min+":"+sec+"."+msec;
    } else if (pattern == 2) {
      // For Distribution Folder Name
      timeMsg = new String(year).concat(month,day,hour,min,sec);
    }
    return timeMsg;
  },

  getCRLF : function(){
    var agent = navigator.userAgent;
    if (agent.indexOf("Win") >=0){
      return "\r\n";
    } else if(agent.indexOf("Mac") >=0){
      return "\r";
    } else {
      // Linux
      return "\n";
    }
  },

  getFileSeparator : function(){
    var agent=navigator.userAgent;
    if (agent.indexOf("Win") >=0){
      return "\\";
    } else if(agent.indexOf("Mac") >=0){
      return "/";
    } else {
      // Linux
      return "/";
    }
  },


  //================================
  // business logic
  //================================

  /*
   * Open distribution condition window.
   *
   * This window is called by menu bar.
   */
  openScrCondition : function() {
    var isRunning = null;
    try {
      // double runnning check
      isRunning = this.prefb.getIntPref("sender-distribution.running");
    } catch(e) {
      // nop. exception always occur at first execution.
    }

    try {
      this.isDebug = this.prefb.getIntPref("sender-distribution.debug");
    } catch(e) {
      // If undefined, set initial value
      this.isDebug = false;
      this.prefb.setIntPref("sender-distribution.debug", this.isDebug);
    }

    if (isRunning == null || isRunning == -1) {
      this.prefb.setIntPref("sender-distribution.running", 1);
      var winopts = "chrome,menubar=yes,status=yes,toolbar=yes";
      window.open("chrome://sender-distribution/content/main.xul", "_blank", winopts);
    } else {
      // stop double running
      alert(this.stbundle.getLocalizedMessage("sndb.running"));
      this.logger.writeWarn("Sender Distribution is runnning.");
      this.logger.writeWarn("please change the prefference value 'sender-distribution.running' to -1");
    }
  },

  /*
   * Initialize conditions.
   *
   * This function is called from onload when initialize window.
   */
  initScrCondition : function() {
    this.logger.writeDebug("start initScrCondition");
    try {
      // create list of available mail addresses
      this.inboxList= getAddressList();
      if (this.inboxList == null) {
        this.logger.writeWarn(this.stbundle.getLocalizedMessage("sndb.list.inbox.none"));
        forceFinish();
      }
      var menulist = document.getElementById("inbox");
      for (var index = 0;index < this.inboxList.length;index++) {
        if (this.inboxList[index] != "" && this.inboxList[index] != "null") {
          menulist.appendItem(this.inboxList[index], index, "");
        }
      }
      if (menulist.itemCount > 0) {
        menulist.selectedIndex = 0; // select first mail address
      }

      // Initialize search conditions
      document.getElementById("unread").setAttribute("selected", true);
      document.getElementById("bt_recount").setAttribute("disabled", true);
      document.getElementById("bt_execute").setAttribute("disabled", true);
    } catch(e) {
      this.logger.writeError("initScrCondition(): "+e);
      alert(e);
      forceFinish();
    }
    this.logger.writeDebug("end initScrCondition");
  },

  /*
   * Get mail address list (POP3 only)
   *
   * IMAP4 not support because there are some folder constraint.
   * ex: folder name length can't match email address length.
   *
   */
  getAddressList : function() {
    this.logger.writeDebug("start getAddressList");

    var inboxFolders = new Array();
    try {
      //
      // Get registered mail address from all servers,
      // then create inbox list to be processed.
      //
      var servers = this.accountManager.allServers;
      if (servers == null || servers.length == 0) {
        // force finish if not exists inbox.
        alert(this.stbundle.getLocalizedMessage("sndb.list.inbox.none"));
        forceFinish();
      }
      for (var index=0;index < servers.length;index++) {
        var server =
          servers.queryElementAt(
            index, Components.interfaces.nsIMsgIncomingServer);
        var inboxFolder = GetInboxFolder(server);
        this.logger.writeDebug("mail type=" + server.type);

        if (inboxFolder != null && server.type == "pop3") {
          inboxFolders.push(server.prettyName);
          this.logger.writeInfo("index=" + index + ", target mail address=" + server.prettyName);
        } else {
          // normal null can't judge properly, so set dummy value and make pulldown empty.
          inboxFolders.push("null");
          this.logger.writeInfo("index=" + index+", inboxFolder is null");
        }
      }
    } catch(e) {
      // If occur exception, do not terminate forcibly and return tothe caller,
      this.logger.writeError("getAddressList(): "+e);
      throw e;
    }

    // force finish if not exists inbox.
    if (inboxFolders.length == 0) {
      alert(this.stbundle.getLocalizedMessage("sndb.list.inbox.none"));
      forceFinish();
    }
    this.logger.writeDebug("end getAddressList");
    return inboxFolders;
  },

  /*
   * Get inbox at specified mail address.
   */
  getInboxFolderByIndex : function(index) {
    this.logger.writeDebug("start getInboxFolderByIndex");

    var inboxFolder;
    try {
      var servers = this.accountManager.allServers;

      // force finish if no server infomations.
      if (servers == null || servers.length == 0) {
        alert(this.stbundle.getLocalizedMessage("sndb.list.inbox.none"));
        forceFinish();
      }
      var server =
        servers.queryElementAt(index, Components.interfaces.nsIMsgIncomingServer);
      inboxFolder = GetInboxFolder(server);

      if (inboxFolder != null) {
        this.logger.writeInfo("inbox="+inboxFolder.URI);
      } else {
        this.logger.writeInfo("inbox is null");
      }
    } catch(e) {
      this.logger.writeError("getInboxFolderByIndex(): "+e);
      throw e;
    }
    this.logger.writeDebug("end getInboxFolderByIndex");
    return inboxFolder;
  },

  /*
   * check distribution conditions.
   *
   * execute if search button clicked.
   */
  checkCondition : function() {
    this.logger.writeDebug("start checkCondition");
    try {
      try {
        var p_edit_status = this.prefb.getIntPref("sender-distribution.condition.p_edit_status");
        if (p_edit_status != null && p_edit_status == 1) {
          changeConditionBtn(false);
          return;
        }
      } catch(e) {
        // nop
      }

      // require check: inbox
      var item = document.getElementById("inbox").selectedItem;
      var p_inbox = item != null ? item.value : -1;
      this.logger.writeDebug("p_inbox = " + p_inbox);
      if (p_inbox == -1) {
        alert(this.stbundle.getLocalizedMessage("sndb.condition.inbox.error"));
        return;
      }

      // value check: folder
      item = document.getElementById("folder").selectedItem;
      var p_folder = item != null ? item.value : -1;
      this.logger.writeDebug("p_folder = " + p_folder);

      if (p_folder == -1) {
        alert(this.stbundle.getLocalizedMessage("sndb.condition.folder.error"));
        return;
      }

      // require check: mail status
      item = document.getElementById("status").selectedItem;
      var p_status = item != null ? item.value : -1;
      this.logger.writeDebug("p_status = " + p_status);

      if (p_status == -1) {
        alert(this.stbundle.getLocalizedMessage("sndb.condition.status.error"));
        return;
      }

      // require check: mail transfer method
      item = document.getElementById("method").selectedItem;
      var p_method = item != null ? item.value : -1;
      this.logger.writeDebug("p_method = " + p_method);

      if (p_method == -1) {
        alert(this.stbundle.getLocalizedMessage("sndb.condition.method.error"));
        return;
      }

      // If condition check is ok, save conditions as property value.
      this.prefb.setIntPref("sender-distribution.condition.p_inbox", p_inbox);
      this.prefb.setIntPref("sender-distribution.condition.p_folder", p_folder);
      this.prefb.setIntPref("sender-distribution.condition.p_status", p_status);
      this.prefb.setIntPref("sender-distribution.condition.p_method", p_method);
      this.prefb.setIntPref("sender-distribution.condition.p_edit_status", 1);

      prepareDistribution();
    } catch(e) {
      this.logger.writeError("checkCondition(): " + e);
      alert(e);
      forceFinish();
    }
    this.logger.writeDebug("end checkCondition");
  },

  /*
   * change each button state.
   */
  changeConditionBtn : function(isDisabled) {
    this.logger.writeDebug("start changeConditionBtn");

    try {
      var bt_prepare_label;
      if (isDisabled) {
        bt_prepare_label = this.stbundle.getLocalizedMessage("sndb.bt_prepare.cancel");
      } else {
        // in case of pressing cancel button
        bt_prepare_label = this.stbundle.getLocalizedMessage("sndb.bt_prepare.init");
        this.prefb.setIntPref("sender-distribution.condition.p_edit_status", 0);
        document.getElementById("bt_recount").setAttribute("disabled", true);
        document.getElementById("bt_execute").setAttribute("disabled", true);
        clearListItems();
        document.getElementById("distinfo").setAttribute("value", "-/-");
      }
      document.getElementById("bt_prepare").setAttribute("label", bt_prepare_label);
      document.getElementById("inbox").setAttribute("disabled", isDisabled);

      document.getElementById("folder").setAttribute("disabled", isDisabled);
      document.getElementById("status").setAttribute("disabled", isDisabled);
      document.getElementById("method").setAttribute("disabled", isDisabled);
    } catch(e) {
      this.logger.writeError("changeConditionBtn(): " + e);
      throw e;
    }
    this.logger.writeDebug("end changeConditionBtn");
  },


  /*
   * prepare mail distribution.
   */
  prepareDistribution : function() {
    this.logger.writeDebug("start prepareDistribution");

    try {
      if (this.prefb.getIntPref("sender-distribution.condition.p_edit_status") == 1) {
        changeConditionBtn(true);
      }

      createDistibutionManageInfo();

      var btnExec = document.getElementById("bt_execute");
      var btnRecnt = document.getElementById("bt_recount");
      var distInfo = getDistibutionInfo();
      if (distInfo.length > 0) {
        showDistibutionInfoList(distInfo);

        // enable distribution button
        btnExec.setAttribute("disabled", false);
        btnRecnt.setAttribute("disabled", false);
      } else {

        // reinput conditions if target mail is nothing.
        btnExec.setAttribute("disabled", true);
        btnRecnt.setAttribute("disabled", true);
        changeConditionBtn(false);
      }
    } catch(e) {
      this.logger.writeError("prepareDistribution(): " + e);
      throw e;
    }
    this.logger.writeDebug("end prepareDistribution");
  },


  /*
   * get a count of target mail number.
   */
  getMailCount : function() {
    this.logger.writeDebug("start getMailCount");

    var mailcount = 0;
    try {
      var p_inbox   = this.prefb.getIntPref("sender-distribution.condition.p_inbox");
      var p_status  = this.prefb.getIntPref("sender-distribution.condition.p_status");
      var inboxFolder = getInboxFolderByIndex(p_inbox);

      if (p_status == 1) {
        mailcount = inboxFolder.getNumUnread(false);
      } else if (p_status == 2) {
        mailcount = inboxFolder.getTotalMessages(false) - inboxFolder.getNumUnread(false);
      } else{
        mailcount = inboxFolder.getTotalMessages(false);
      }
    } catch(e) {
      this.logger.writeError("getMailCount(): " + e);
      throw e;
    }
    this.logger.writeDebug("end getMailCount");
    return mailcount;
  },

  /*
   * retrieve mail address from sender of mail header.
   */
  retrieveMadr : function(headerFrom) {
    this.logger.writeDebug("start retrieveMadr");

    // it is possible that sender isn't enclosed by <>
    email = headerFrom;

    try {
      var start = headerFrom.lastIndexOf('<');
      var end = headerFrom.lastIndexOf('>');
      if (start > 0 && end > 0) {
        email = headerFrom.substring(start+1, end);
      }
    } catch(e) {
      this.logger.writeError("retrieveMadr(): " + e);
      throw e;
    }
    this.logger.writeDebug("end retrieveMadr");
    return email;
  },

  /*
   * create a distribution manager information.
   *
   * output mail informations of specified folder to file.
   */
  createDistibutionManageInfo : function() {
    this.logger.writeDebug("start createDistibutionManageInfo");

    var count = 0;
    var percentage = 0;
    var inboxFolder;
    var database;

    try {
      var mailcount = getMailCount();
      var manageAry = new Array();
      var p_inbox = this.prefb.getIntPref("sender-distribution.condition.p_inbox");
      var p_status =this.prefb.getIntPref("sender-distribution.condition.p_status");
      inboxFolder = getInboxFolderByIndex(p_inbox);
      database = inboxFolder.msgDatabase;
      var enumerator = database.EnumerateMessages();

      // delete existing list file.
      deleteDistibutionListFile();

      // retrieve sender address from mail header.
      while (enumerator.hasMoreElements()) {
        var header = enumerator.getNext();
        if (header instanceof Components.interfaces.nsIMsgDBHdr) {
          if ((p_status == 1 && header.isRead == true) || (p_status == 2 && header.isRead == false))
            continue;
          var isMatch = false;
          var author = retrieveMadr(header.mime2DecodedAuthor);

          for (var index = 0;index < manageAry.length;index++) {
            if (manageAry[index]['author'] == author) {
              isMatch = true;
              break;
             }
          }
          if (isMatch == false) {
            // if mail address in process is not included manager file
            var item = {author: author, count: 1};
            manageAry.push(item);
          } else {
            manageAry[index]['count']++;
          }
          count++;

          // calculate progress rate in case of debug mode
          if (this.isDebug) {
            percentage = Math.round((count / mailcount) * 100);
            this.logger.writeDebug(
              "count=" + count + ", mailcount=" + mailcount + ", percentage=" + percentage);
          }
        }
      }

      // save a count of mail number(this value is used to the value validation)
      this.prefb.setIntPref("sender-distribution.condition.mailcount", mailcount);

      // output mail information to a manager file.
      outputDistibutionManagerFile(manageAry, mailcount);

      var p_folder = this.prefb.getIntPref("sender-distribution.condition.p_folder");
      if (p_folder == 2) {
        // decide distribution folder name using date & time
        this.prefb.setCharPref("sender-distribution.condition.p_folder_name", getTime(2));
      }
    } catch(e) {
      this.logger.writeError("createDistibutionManageInfo(): " + e);
      throw e;
    } finally {
      database = null;
      inboxFolder.msgDatabase = null;
    }
    this.logger.writeDebug("end createDistibutionManageInfo");
  },

  deleteDistibutionListFile : function() {
    this.logger.writeDebug("start deleteDistibutionListFile");
    try {
      var file = Components
          .classes['@mozilla.org/file/local;1']
          .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(this.propd.path + getFileSeparator() + FILENAME_LIST);
      if (file.exists()) {
        file.remove(false);
        this.logger.writeInfo("deleted " + this.propd.path + getFileSeparator() + FILENAME_LIST);
      }
    } catch(e) {
      this.logger.writeError("deleteDistibutionListFile(): " + e);
      throw e;
    }
    this.logger.writeDebug("end deleteDistibutionListFile");
  },


  /*
   * output a distribution list file using mail header information.
   */
  outputDistibutionListFile : function(header) {
    this.logger.writeDebug("start outputDistibutionListFile");

    var converterStream;
    var fileStream;
    try {
      var file = Components
          .classes['@mozilla.org/file/local;1']
          .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(this.propd.path + getFileSeparator() + FILENAME_LIST);
      if (!file.exists()) {
        file.create(file.NORMAL_FILE_TYPE, 0666);
        this.logger.writeInfo("created "+ this.propd.path + getFileSeparator() + FILENAME_LIST);
      }
      fileStream = Components
          .classes['@mozilla.org/network/file-output-stream;1']
          .createInstance(Components.interfaces.nsIFileOutputStream);
      fileStream.init(file, 0x02 | 0x08 | 0x10, 0x664, false);

      converterStream = Components
          .classes['@mozilla.org/intl/converter-output-stream;1']
          .createInstance(Components.interfaces.nsIConverterOutputStream);
      converterStream.init(fileStream, this.CHARSET, 0,
          Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

      converterStream.writeString(
        retrieveMadr(header.mime2DecodedAuthor) + "," + header.messageId + RTNCD);
    } catch(e) {
      this.logger.writeError("outputDistibutionListFile(): " + e);
      throw e;
    } finally{
      if (converterStream != null) {
        converterStream.close();
      }
      if (fileStream != null) {
        fileStream.close();
      }
    }
    this.logger.writeDebug("end outputDistibutionListFile");
  },

  /*
   * output a manager file(consists of a count of mail per mail address)
   */
  outputDistibutionManagerFile : function(manageAry, mailcount) {
    this.logger.writeDebug("start outputDistibutionManagerFile");

    var converterStream;
    var fileStream;
    try {
      var file = Components
          .classes['@mozilla.org/file/local;1']
          .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(this.propd.path + getFileSeparator() + FILENAME_MANAGER);
      if (file.exists()) {
        file.remove(false);
        this.logger.writeInfo("delete " + this.propd.path + getFileSeparator() + FILENAME_MANAGER);
      }
      file.create(file.NORMAL_FILE_TYPE, 0666);

      fileStream = Components
          .classes['@mozilla.org/network/file-output-stream;1']
          .createInstance(Components.interfaces.nsIFileOutputStream);

      // because avoiding file read only, include 0x10 to value.
      fileStream.init(file, 0x02 | 0x08 | 0x10, 0x664, false);

      converterStream = Components
          .classes['@mozilla.org/intl/converter-output-stream;1']
          .createInstance(Components.interfaces.nsIConverterOutputStream);
      converterStream.init(fileStream, this.CHARSET, 0,
          Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
      converterStream.writeString("totalcount=" + mailcount + RTNCD);

      for (var index=0;index<manageAry.length;index++) {
        // a count of mail per mail address
        converterStream.writeString("folder=" + manageAry[index]['author'] + RTNCD);
        converterStream.writeString("count=" + manageAry[index]['count'] + RTNCD);
      }
    } catch(e) {
      this.logger.writeError("outputDistibutionManagerFile(): " + e);
      throw e;
    } finally{
      if (converterStream != null) {
        converterStream.close();
      }
      if (fileStream != null) {
        fileStream.close();
      }
    }
    this.logger.writeDebug("end outputDistibutionManagerFile");
  },

  /*
   * create list file consist of mail address and mail header id.
   */
  createDistibutionListInfo : function(manageAry) {
    this.logger.writeDebug("start createDistibutionListInfo");

    var inboxFolder;
    var database;

    try {
      var p_inbox = this.prefb.getIntPref("sender-distribution.condition.p_inbox");
      var p_status =this.prefb.getIntPref("sender-distribution.condition.p_status");
      inboxFolder = getInboxFolderByIndex(p_inbox);
      database = inboxFolder.msgDatabase;
      var enumerator = database.EnumerateMessages();

      // If follow A and B matched, then sender is target.
      //
      //   A: mail sender matching the distribution condition.
      //   B: mail sender passed as parameter of this function
      //
      while (enumerator.hasMoreElements()) {
        var header = enumerator.getNext();
        if (header instanceof Components.interfaces.nsIMsgDBHdr) {
          if ((p_status == 1 && header.isRead == true) || (p_status == 2 && header.isRead == false))
            continue;
          var isMatch = false;
          var author = retrieveMadr(header.mime2DecodedAuthor);

          for (var index = 0;index < manageAry.length;index++) {
            if (manageAry[index] == author) {
              isMatch = true;
              break;
             }
          }
          if (isMatch == false) {
            continue;
          }
          outputDistibutionListFile(header);
        }
      }
    } catch(e) {
      this.logger.writeError("createDistibutionListInfo(): " + e);
      throw e;
    } finally {
      database = null;
      inboxFolder.msgDatabase = null;
    }
    this.logger.writeDebug("end createDistibutionListInfo");
  },

  /*
   * read mail addresses for treechildren from manager file.
   */
  readDistibutionManagerFile : function() {
    this.logger.writeDebug("start readDistibutionManagerFile");

    var fileStream;
    var lis;
    try {
      var file = Components
        .classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(this.propd.path + getFileSeparator() + FILENAME_MANAGER);

      fileStream = Components
          .classes['@mozilla.org/network/file-input-stream;1']
          .createInstance(Components.interfaces.nsIFileInputStream);
      fileStream.init(file, 1, 0, false);

      var CC = Components.Constructor;
      var ConverterInputStream = CC("@mozilla.org/intl/converter-input-stream;1",
                    "nsIConverterInputStream",
                    "init");
      lis = new ConverterInputStream(fileStream, this.CHARSET, 1024, 0x0);
      lis.QueryInterface(Components.interfaces.nsIUnicharLineInputStream);

      var folders = new Array();
      var folder = null;
      var totalcount;
      var isRead = false;  // update to true in case of reading 1 or more records.
      var out = {value: ""};
      do {
        out.value = "";
        var cont = lis.readLine(out);
        var value = out.value;
        if (value.match(/^folder/)) {
          if (isRead) {
            folders.push(folder);
            folder = null;
          }
          isRead = true;

          // initialize folder array when reading folder row.
          folder = new Array();
          folder['folder'] = value.replace(/^folder=/g, '');
          folder['count'] = 0;
        } else if (value.match(/^count/)) {
          folder['count'] = value.split('=')[1];
        } else if (value.match(/^totalcount/)) {
          totalcount = value.split('=')[1];
          mailcount = this.prefb.getIntPref("sender-distribution.condition.mailcount");
          this.logger.writeInfo("mailcount=" + mailcount + ", totalcount=" + totalcount);
          if (mailcount != totalcount) {
            this.logger.writeError("mailcount is not equal to totalcount");
            throw this.stbundle.getLocalizedMessage("sndb.unmatch.count");
          }
        }
        if (cont == false && folder != null) {
          folders.push(folder);
        }
      } while(cont);
    } catch(e) {
      this.logger.writeError("readDistibutionManagerFile(): " + e);
      throw e;
    } finally {
      if (lis != null) {
        lis.close();
      }
      if (fileStream != null) {
        fileStream.close();
      }
    }

    // sort order
    //  a count of mail (ascending) -> mail address (decending)
    folders.sort(function(a, b){
      var cntA = Number(a['count']);
      var cntB = Number(b['count']);
      if (cntA > cntB) return -1;
      if (cntA < cntB) return 1;
      //if (a['count'] > b['count']) return -1;
      //if (a['count'] < b['count']) return 1;

      if (a['folder'] > b['folder']) return -1;
      if (a['folder'] < b['folder']) return 1;
      return 0;
    });

    this.logger.writeDebug("end readDistibutionManagerFile");
    return folders;
  },

  /*
   * Get distribution infomation from manager file.
   */
  getDistibutionInfo : function() {
    this.logger.writeDebug("start getDistibutionInfo");

    var managerAry = null;
    try {
      // reconfirm a count of selected mail address
      managerAry = readDistibutionManagerFile();
      if (managerAry.length == 0) {
        this.logger.writeWarn("there are no mail by selected conditions.");
        alert(this.stbundle.getLocalizedMessage("sndb.info.nomail"));
      }
    } catch(e) {
      this.logger.writeError("getDistibutionInfo(): " + e);
      throw e;
    } finally {
      this.logger.writeDebug("end getDistibutionInfo");
    }
    return managerAry;
  },

  /*
   * show distribution infomation(main number and mail list).
   */
  showDistibutionInfoList : function(managerAry) {
    this.logger.writeDebug("start showDistibutionInfo");

    try {
      var mailcount = getMailCount();
      var distinfo = document.getElementById("distinfo");
      distinfo.setAttribute("value", managerAry.length + "/" + mailcount);

      // append distributions to treeitem
      for(var index = 0;index < managerAry.length;index++) {
        var folder = managerAry[index];
        appendDistributionListItem(index, folder);
      }
    } catch(e) {
      this.logger.writeError("showDistibutionInfo(): " + e);
      throw e;
    }
    return;
  },

  /*
   * retrieve checked mail address.
   */
  getTargetMailAddress : function() {
    this.logger.writeDebug("start getTargetMailAddress");

    var mailAddrAry;

    try {
      mailAddrAry = new Array();
      var listbox = document.getElementById("MailAddrListBox");
      var rows = listbox.getElementsByTagNameNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treerow");

      for (var idx = 0;idx < rows.length;idx++) {
        var chkValue = toBoolean(rows[idx].children[0].getAttribute('value'));

        if (chkValue) {
          var cell = document.getElementById("mailaddr-" + idx);
          var email = cell.getAttribute('label');
          this.logger.writeDebug("email=" + email);

          mailAddrAry.push(email);
        }
      }
    } catch(e) {
      this.logger.writeError("getTargetMailAddress(): " + e);
      throw e;
    }

    this.logger.writeDebug("end getTargetMailAddress");
    return mailAddrAry;
  },

  recountTargetMail : function() {
    this.logger.writeDebug("start recountTargetMail");

    try {
      var listbox = document.getElementById("MailAddrListBox");
      var totalCnt = 0;
      var totalMailAdrCnt = 0;

      var rows = listbox.getElementsByTagNameNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treerow");

      for (var idx = 0;idx < rows.length;idx++) {
        // get a checkbox value of first record
        var chkValue = toBoolean(rows[idx].children[0].getAttribute('value'));
        this.logger.writeDebug("idx/value=" + idx + "/" + chkValue + "(" + typeof(chkValue) + ")");

        if (chkValue) {
          var cell = document.getElementById("mailaddr-" + idx);
          var email = cell.getAttribute('label');
          cell = document.getElementById("cnt-" + idx);
          var cnt = cell.getAttribute('label');
          this.logger.writeDebug("email/cnt=" + email + "/" +cnt);

          totalCnt+=parseInt(cnt, 10);
          totalMailAdrCnt++;
        }
      }

      var distinfo = document.getElementById("distinfo");
      distinfo.setAttribute("value", totalMailAdrCnt + "/" + totalCnt);
    } catch(e) {
      this.logger.writeError("recountTargetMail(): " + e);
      alert(e);
      forceFinish();
    }
    this.logger.writeDebug("end recountTargetMail");
  },

  doDistribution : function() {
    this.logger.writeDebug("start doDistribution");

    var fileStream;
    var lis;

    var isMove = false;
    var method = this.prefb.getIntPref("sender-distribution.condition.p_method");
    if (method == 2) {
      isMove = true
    }

    try {
      // prepare for reading files
      var file = Components
        .classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(this.propd.path + getFileSeparator() + FILENAME_LIST);

      fileStream = Components
        .classes['@mozilla.org/network/file-input-stream;1']
        .createInstance(Components.interfaces.nsIFileInputStream);
      fileStream.init(file, 1, 0, false);

      var CC = Components.Constructor;
      var ConverterInputStream = CC("@mozilla.org/intl/converter-input-stream;1",
                    "nsIConverterInputStream",
                    "init");
      lis = new ConverterInputStream(fileStream, this.CHARSET, 1024, 0x0);
      lis.QueryInterface(Components.interfaces.nsIUnicharLineInputStream);

      var count = 0;
      var out = {value: ""};
      var srcFolder =
        getInboxFolderByIndex(this.prefb.getIntPref("sender-distribution.condition.p_inbox"));
      this.logger.writeDebug("srcFolder.URI=" + srcFolder.URI);

      // prepare api for mail copy(or move)
      var copyService =
        Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
                .getService(Components.interfaces.nsIMsgCopyService);

      //
      // create distribution folder.
      //
      // sender-distribution.condition.p_folder = 1 is invalid
      // because API GetMsgFolderFromUri() has disabled
      // and achived the process of moving mail to temporary folder.
      //
      var dstBaseFolder;
      var subfolder_name = this.prefb.getCharPref("sender-distribution.condition.p_folder_name");
      if (srcFolder.containsChildNamed(subfolder_name) == false) {
        srcFolder.createSubfolder(subfolder_name, null);
        this.logger.writeInfo("created sub folder=" + subfolder_name);
      }
      dstBaseFolder = srcFolder.findSubFolder(subfolder_name);

      var database = srcFolder.msgDatabase;

      do {
        // get mail header infomation from database by message id,
        // and execute mail transfer using the header.
        //
        //
        // ===format of sender-distribution-list.txt===
        // mail address,mail header id
        // (unique mail header id is assigned automatically for same mail address)
        //
        out.value = "";
        var cont = lis.readLine(out);
        var record = out.value.split(',');

        if (dstBaseFolder.containsChildNamed(record[0]) == false) {
          dstBaseFolder.createSubfolder(record[0], null);
          this.logger.writeInfo("created sub folder=" + record[0]);
        }
        var dstFolder = dstBaseFolder.findSubFolder(record[0]);
        this.logger.writeDebug("folder=" + dstFolder.URI + ",msgid=" + record[1]);

        var msg = database.getMsgHdrForMessageID(record[1]);
        var array = Components.classes["@mozilla.org/array;1"]
                .createInstance(Components.interfaces.nsIMutableArray);
        array.appendElement(msg, false);

        copyService.CopyMessages(srcFolder, array, dstFolder, isMove, null, null, false);
        count++;

        // calculate progress rate in case of debug mode
        if (this.isDebug) {
          var percentage = (count / mailcount) * 100;
          this.logger.writeDebug("count=" + count + ", mailcount=" + mailcount + ", percentage=" + percentage);
        }
      } while(cont);
      alert(this.stbundle.getLocalizedMessage("sndb.finish"));
    } catch(e) {
      this.logger.writeError("doDistribution(): " + e);
      throw e;
    } finally {
      if (lis != null) {
        lis.close();
      }
      if (fileStream != null) {
        fileStream.close();
      }
      database = null;
      srcFolder.msgDatabase = null;
    }
    this.logger.writeDebug("end doDistribution");
    return;
  },

  /*
   * execute in case of pressing distribution execution button.
   */
  executeDistribution : function() {
    this.logger.writeDebug("start executeDistribution");

    try {
      // get number of checked mail address
      var mailAddrAry = getTargetMailAddress();
      if (mailAddrAry.length == 0) {
        alert(this.stbundle.getLocalizedMessage("sndb.noselect"));
        return;
      }

      createDistibutionListInfo(mailAddrAry);
      doDistribution();

      // erase distribution infomations, and initialize condition.
      changeConditionBtn(false);
    } catch(e) {
      this.logger.writeError("executeDistribution(): " + e);
      forceFinish();
    }
    this.logger.writeDebug("end executeDistribution");
    return;
  },

  /*
   * delete all distibution infomations in treechildren.
   */
  clearListItems : function() {
    this.logger.writeDebug("start clearListItems");
    try {
      var treechild = document.getElementById("tc");
      while (treechild.firstChild) {
        treechild.removeChild(treechild.firstChild);
      }
      document.getElementById("distinfo").setAttribute("value", "-/-");
    } catch(e) {
      this.logger.writeError("clearListItems(): " + e);
      throw e;
    }
    this.logger.writeDebug("end clearListItems");
  },

  /*
   * append distribution to treeitem.
   */
  appendDistributionListItem : function(idx, folder) {
    this.logger.writeDebug("start appendDistributionListItem");
    this.logger.writeDebug("idx=" + idx);
    try {
      var treechild = document.getElementById("tc");
      var cellChkBox =
        document.createElementNS (
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treecell");
      var cellAddr =
        document.createElementNS (
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treecell");
      var cellCount =
        document.createElementNS (
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treecell");
      var cellFolder =
        document.createElementNS (
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treecell");

      cellChkBox.setAttribute('id', "chk-" + idx);
      cellChkBox.setAttribute('value', true);

      cellAddr.setAttribute('id', "mailaddr-" + idx);
      cellAddr.setAttribute('label', folder['folder']);
      cellAddr.setAttribute('tooltiptext', folder['folder']);
      cellAddr.setAttribute('crop', "end");
      cellAddr.setAttribute('editable', false);

      cellCount.setAttribute('id', "cnt-" + idx);
      cellCount.setAttribute("label",  folder['count']);
      cellCount.setAttribute('tooltiptext', folder['count']);
      cellCount.setAttribute('crop', "none");
      cellCount.setAttribute('editable', false);

      var folder_name = "";
      var p_folder = this.prefb.getIntPref("sender-distribution.condition.p_folder");
      if (p_folder == 1) {
        folder_name =
          this.stbundle.getLocalizedMessage("sndb.inbox.title")
          + getFileSeparator() + folder['folder'];
      } else {
        folder_name =
          this.stbundle.getLocalizedMessage("sndb.inbox.title")
          + getFileSeparator()
          + this.prefb.getCharPref("sender-distribution.condition.p_folder_name")
          + getFileSeparator() + folder['folder'];
      }
      cellFolder.setAttribute('id', "folder-" + idx);
      cellFolder.setAttribute('label', folder_name);
      cellFolder.setAttribute('tooltiptext', folder_name);
      cellFolder.setAttribute('crop', "end");
      cellFolder.setAttribute('editable', false);

      this.logger.writeDebug(
        "addr=" + folder['folder'] + ",count=" + folder['count'] + ",dstfolder=" + folder_name);

      var valueRow =
        document.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treerow");
      valueRow.setAttribute('id', "listRow-" + idx);
      valueRow.appendChild(cellChkBox);
      valueRow.appendChild(cellAddr);
      valueRow.appendChild(cellCount);
      valueRow.appendChild(cellFolder);

      var valueItem =
        document.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treeitem");
      valueItem.appendChild(valueRow);

      // append distribution information to tail of list.
      treechild.appendChild(valueItem);

      this.logger.writeDebug(
        "addr=" + folder['folder'] + ",count=" + folder['count'] + ",dstfolder=" + folder_name);
    } catch(e) {
      this.logger.writeError("appendDistributionListItem(): " + e);
      throw e;
    }
    this.logger.writeDebug("end appendDistributionListItem");
  },

  /*
   * change all checkboxes status by one click.
   */
  changeAllCheckboxStatus : function() {
    this.logger.writeDebug("start changeAllCheckboxStatus");
    try {
      var listbox = document.getElementById("MailAddrListBox");
      var rows = listbox.getElementsByTagNameNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treerow");

      for (var idx = 0;idx < rows.length;idx++) {
        var chkbox = document.getElementById("chk-" + idx);
        chkbox.setAttribute('value', this.chkBoxStatus);
        this.logger.writeDebug("chkbox idx/status = " + idx + "/" + this.chkBoxStatus);
      }

      this.chkBoxStatus = !this.chkBoxStatus;
    } catch(e) {
      this.logger.writeError("changeAllCheckboxStatus(): " + e);
      throw e;
    }
    this.logger.writeDebug("end changeAllCheckboxStatus");
  },

  /*
   * reset all properties.
   */
  resetProp : function() {
    this.logger.writeDebug("start resetProp");
    try {
      this.prefb.setIntPref("sender-distribution.running", -1);
      this.prefb.setIntPref("sender-distribution.condition.p_inbox", -1);
      this.prefb.setIntPref("sender-distribution.condition.p_folder", -1);
      this.prefb.setCharPref("sender-distribution.condition.p_folder_name", "");
      this.prefb.setIntPref("sender-distribution.condition.p_status", -1);
      this.prefb.setIntPref("sender-distribution.condition.p_method", -1);
      this.prefb.setIntPref("sender-distribution.condition.p_edit_status", -1);
      this.prefb.setIntPref("sender-distribution.condition.mailcount", -1);
    } catch(e) {
      this.logger.writeError("resetProp(): " + e);
    }
    this.logger.writeDebug("end resetProp");

  },

  forceFinish : function() {
    this.logger.writeDebug("start forceFinish");
    resetProp();
    this.logger.writeDebug("end forceFinish");
    window.close();
  }
};
