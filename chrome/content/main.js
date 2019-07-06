// 広域変数
var inboxList = null;
var mailcount = 0;
var chkBoxStatus = false;

// 定数
var CHARSET = 'UTF-8';
var RTNCD = "\r\n";
var FILENAME_LOG = 'sender-distribution.log';
var FILENAME_MANAGER = 'sender-distribution-manager.txt';
var FILENAME_LIST = 'sender-distribution-list.txt';

var LOG_DEBUG = "DEBUG";
var LOG_INFO = "INFO";
var LOG_WARN = "WARN";
var LOG_ERROR = "ERROR";

// デバッグ状態は設定エディタより変更可能
var isDebug = false;

var prefb = Components.classes["@mozilla.org/preferences-service;1"]
         .getService(Components.interfaces.nsIPrefBranch);

var prefs = Components.classes["@mozilla.org/preferences-service;1"]
         .getService(Components.interfaces.nsIPrefService);

var propd = Components.classes["@mozilla.org/file/directory_service;1"]
         .getService(Components.interfaces.nsIProperties)
         .get("ProfD", Components.interfaces.nsIFile);

var stbundle = {
  _bundle: Components.classes["@mozilla.org/intl/stringbundle;1"]
        .getService(Components.interfaces.nsIStringBundleService)
         .createBundle("chrome://sender-distribution/locale/sender-distribution.properties"),
  getLocalizedMessage: function(msg) {
    try {
      return this._bundle.GetStringFromName(msg);
    } catch(e) {
      logger.writeError("getLocalizedMessage(): " + e);
      return null;
    }
  }
};

var logger = {
  writeLog : function(level, data) {
    var foStream;
    try {
      var file = Components.classes['@mozilla.org/file/local;1']
            .createInstance(Components.interfaces.nsIFile);
      file.initWithPath(propd.path + getFileSeparator() + FILENAME_LOG);
      if (!file.exists()) file.create(file.NORMAL_FILE_TYPE, 0666);

      foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Components.interfaces.nsIFileOutputStream);
      // PR_WRONLY | PR_CREATE_FILE | PR_APPEND
      foStream.init(file, 0x02 | 0x08 | 0x10, 0664, 0); 

      RTNCD = getCRLF();
      data = getTime(1) + " <" + level + "> " + data + RTNCD;
      foStream.write(data,data.length);
    } catch(e) {
      if (isDebug) alert(e);
    } finally {
      if (foStream != null) {
        foStream.close();
      }
    }
  },
  writeDebug : function(data) {
    if (isDebug) this.writeLog(LOG_DEBUG, data);
  },
  writeInfo :  function(data) {
    this.writeLog(LOG_INFO, data);
  },
  writeWarn :  function(data) {
    this.writeLog(LOG_WARN, data);
  },
  writeError :  function(data) {
    this.writeLog(LOG_ERROR, data);
  }
}

var accountManager
  = Components.classes["@mozilla.org/messenger/account-manager;1"]
            .getService(Components.interfaces.nsIMsgAccountManager);


////////////////
//  共通関数  //
////////////////
function toBoolean (data) {
  return data.toLowerCase() === 'true';
}

function zeroPadding(value, length){
    return ('0000000000' + value).slice(-length);
}

function getTime(pattern) {
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
}

function getCRLF(){
  var agent = navigator.userAgent;
  if (agent.indexOf("Win") >=0){
    return "\r\n";
  } else if(agent.indexOf("Mac") >=0){
    return "\r";
  } else {
    // Linux
    return "\n";
  }
}

function getFileSeparator(){
  var agent=navigator.userAgent;
  if (agent.indexOf("Win") >=0){
    return "\\";
  } else if(agent.indexOf("Mac") >=0){
    return "/";
  } else {
    // Linux
    return "/";
  }
}


///////////////////////
// メール振分処理    //
///////////////////////

// メール振分条件画面を開く。メニューバーから最初に実行する。
function openScrCondition() {
  var isRunning = null;
  try {
    // double open check
    isRunning = prefb.getIntPref("sender-distribution.running");
  } catch(e) {
    // 初回起動時はどうしても例外が発生する
  }

  try {
    isDebug = prefb.getIntPref("sender-distribution.debug");
  } catch(e) {
    // 未定義の場合、初期値を設定
    isDebug = false;
    prefb.setIntPref("sender-distribution.debug", isDebug);
  }

  if (isRunning == null || isRunning == -1) {
    prefb.setIntPref("sender-distribution.running", 1);
    var winopts = "chrome,menubar=yes,status=yes,toolbar=yes";
    window.open("chrome://sender-distribution/content/main.xul", "_blank", winopts);
  } else {
    // 二重起動防止
    alert(stbundle.getLocalizedMessage("sndb.running"));
    logger.writeWarn("Sender Distribution is runnning.");
    logger.writeWarn("please change the prefference value 'sender-distribution.running' to -1");
  }
}

/*
 * Initialize conditions.
 *
 * This function is called from onload when initialize window.
 */
function initScrCondition() {
  logger.writeDebug("start initScrCondition");
  try {
    //
    // create list of available mail addresses
    //
    inboxList= getAddressList();
    if (inboxList == null) {
      logger.writeWarn(stbundle.getLocalizedMessage("sndb.list.inbox.none"));
      forceFinish();
    }
    var menulist = document.getElementById("inbox");
    for (var index = 0;index < inboxList.length;index++) {
      if (inboxList[index] != "" && inboxList[index] != "null") {
        menulist.appendItem(inboxList[index], index, "");
      }
    }
    if (menulist.itemCount > 0) {
      menulist.selectedIndex = 0; // select first mail address
    }
    
    //
    // Initialize search conditions
    //
    document.getElementById("unread").setAttribute("selected", true);
    document.getElementById("bt_recount").setAttribute("disabled", true);
    document.getElementById("bt_execute").setAttribute("disabled", true);
  } catch(e) {
    logger.writeError("initScrCondition(): "+e);
    alert(e);
    forceFinish();
  }
  logger.writeDebug("end initScrCondition");
}

// POP3用メールアドレス一覧取得
function getAddressList() {
  logger.writeDebug("start getAddressList");

  var inboxFolders = new Array();
  try {
    // 全サーバ情報から登録済みメールアドレスを取得し、
    // 処理対象となる受信フォルダの一覧を作成
    var servers = accountManager.allServers;
    if (servers == null || servers.length == 0) {
      // 受信フォルダが存在しない場合、強制終了
      alert(stbundle.getLocalizedMessage("sndb.list.inbox.none"));
      forceFinish();
    }
    for (var index=0;index < servers.length;index++) {
      var server =
        servers.queryElementAt(
          index, Components.interfaces.nsIMsgIncomingServer);
      var inboxFolder = GetInboxFolder(server);
      logger.writeDebug("mail type=" + server.type);

      // pop3のみ対象とする
      // IMAPはフォルダ長に上限があったり、他にもフォルダ作成に制約があるので対象外とした
      if (inboxFolder != null && server.type == "pop3") {
        inboxFolders.push(server.prettyName);
        logger.writeInfo("index=" + index + ", target mail address=" + server.prettyName);
      } else {
        inboxFolders.push("null");  // 通常のnullだと判定が適切にできなかったので
                                    // ダミー値を設定し、プルダウン値を空にする
        logger.writeInfo("index=" + index+", inboxFolder is null");
      }
    }
  } catch(e) {
    // 例外時は強制終了せず、呼び出し元に戻る
    logger.writeError("getAddressList(): "+e);
    throw e;
  }
  
  if (inboxFolders.length == 0) {
    // 処理対象となる受信フォルダが存在しない場合、強制終了
    alert(stbundle.getLocalizedMessage("sndb.list.inbox.none"));
    forceFinish();
  }
  logger.writeDebug("end getAddressList");
  return inboxFolders;
}

// 指定したメールアドレスの受信フォルダ取得
function getInboxFolderByIndex(index) {
  logger.writeDebug("start getInboxFolderByIndex");
  
  var inboxFolder;
  try {
    var servers = accountManager.allServers;
    if (servers == null || servers.length == 0) {
      // サーバ情報が存在しない場合、強制終了
      alert(stbundle.getLocalizedMessage("sndb.list.inbox.none"));
      forceFinish();
    }
    var server =
      servers.queryElementAt(index, Components.interfaces.nsIMsgIncomingServer);
    inboxFolder = GetInboxFolder(server);

    if (inboxFolder != null) {
      logger.writeInfo("inbox="+inboxFolder.URI);
    } else {
      logger.writeInfo("inbox is null");
    }
  } catch(e) {
    logger.writeError("getInboxFolderByIndex(): "+e);
    throw e;
  }
  logger.writeDebug("end getInboxFolderByIndex");
  return inboxFolder;
}

// 振分条件チェック
// 振分条件画面で振分準備ボタン押下時に実行
function checkCondition() {
  logger.writeDebug("start checkCondition");
  try {
    try {
      var p_edit_status = prefb.getIntPref("sender-distribution.condition.p_edit_status");
      if (p_edit_status != null && p_edit_status == 1) {
        changeConditionBtn(false);
        return;
      }
    } catch(e) {
      // nop
    }

    // Inboxフォルダ・入力必須チェック
    var item = document.getElementById("inbox").selectedItem;
    var p_inbox = item != null ? item.value : -1;
    logger.writeDebug("p_inbox = " + p_inbox);
    if (p_inbox == -1) {
      alert(stbundle.getLocalizedMessage("sndb.condition.inbox.error"));
      return;
    }
    //  サブフォルダ選択時のみサブフォルダ名チェック
    item = document.getElementById("folder").selectedItem;
    var p_folder = item != null ? item.value : -1;
    logger.writeDebug("p_folder = " + p_folder);

    if (p_folder == -1) {
      alert(stbundle.getLocalizedMessage("sndb.condition.folder.error"));
      return;
    }
    // 状態・入力必須チェック
    item = document.getElementById("status").selectedItem;
    var p_status = item != null ? item.value : -1;
    logger.writeDebug("p_status = " + p_status);

    if (p_status == -1) {
      alert(stbundle.getLocalizedMessage("sndb.condition.status.error"));
      return;
    }
    // 移動方法・入力必須チェック
    item = document.getElementById("method").selectedItem;
    var p_method = item != null ? item.value : -1;
    logger.writeDebug("p_method = " + p_method);

    if (p_method == -1) {
      alert(stbundle.getLocalizedMessage("sndb.condition.method.error"));
      return;
    }
    
    // チェックが正常終了した場合、各値をプロパティとして保存
    prefb.setIntPref("sender-distribution.condition.p_inbox", p_inbox);
    prefb.setIntPref("sender-distribution.condition.p_folder", p_folder);
    prefb.setIntPref("sender-distribution.condition.p_status", p_status);
    prefb.setIntPref("sender-distribution.condition.p_method", p_method);
    prefb.setIntPref("sender-distribution.condition.p_edit_status", 1);

    prepareDistribution();
  } catch(e) {
    logger.writeError("checkCondition(): " + e);
    alert(e);
    forceFinish();
  }
  logger.writeDebug("end checkCondition");
}

// 振分条件ボタンの状態を切り替える
function changeConditionBtn(isDisabled) {
  logger.writeDebug("start changeConditionBtn");

  try {
    var bt_prepare_label;
    if (isDisabled) {
      bt_prepare_label = stbundle.getLocalizedMessage("sndb.bt_prepare.cancel");
    } else {
      // 条件再入力を押下した場合
      bt_prepare_label = stbundle.getLocalizedMessage("sndb.bt_prepare.init");
      prefb.setIntPref("sender-distribution.condition.p_edit_status", 0);
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
    logger.writeError("changeConditionBtn(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  logger.writeDebug("end changeConditionBtn");
}



// 振分実行準備
function prepareDistribution() {
  logger.writeDebug("start prepareDistribution");

  try {  
    if (prefb.getIntPref("sender-distribution.condition.p_edit_status") == 1) {
      changeConditionBtn(true);
    }
    
    createDistibutionManageInfo();

    var btnExec = document.getElementById("bt_execute");
    var btnRecnt = document.getElementById("bt_recount");
    var distInfo = getDistibutionInfo();
    if (distInfo.length > 0) {
      showDistibutionInfoList(distInfo);
      
      // 振分実行ボタンを有効にする
      btnExec.setAttribute("disabled", false);
      btnRecnt.setAttribute("disabled", false);
    } else {
      // 振分対象メールが無い場合、条件再入力
      btnExec.setAttribute("disabled", true);
      btnRecnt.setAttribute("disabled", true);
      changeConditionBtn(false);
    }
  } catch(e) {
    logger.writeError("prepareDistribution(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  logger.writeDebug("end prepareDistribution");
}



// 振分対象メール件数取得
function getMailCount() {
  logger.writeDebug("start getMailCount");

  var mailcount = 0;
  try {
    var p_inbox   = prefb.getIntPref("sender-distribution.condition.p_inbox");
    var p_status  = prefb.getIntPref("sender-distribution.condition.p_status"); 
    var inboxFolder = getInboxFolderByIndex(p_inbox);

    if (p_status == 1) {
      mailcount = inboxFolder.getNumUnread(false);
    } else if (p_status == 2) {
      mailcount = inboxFolder.getTotalMessages(false) - inboxFolder.getNumUnread(false);
    } else{
      mailcount = inboxFolder.getTotalMessages(false);
    }
  } catch(e) {
    logger.writeError("getMailCount(): " + e);
    throw e;
  }
  logger.writeDebug("end getMailCount");
  return mailcount;
}

// メールヘッダ・差出名からメールアドレスを抽出
function retrieveMadr(headerFrom) {
  logger.writeDebug("start retrieveMadr");
  
  // 差出名が<>で囲われていないこともある
  email = headerFrom;

  try {
    var start = headerFrom.lastIndexOf('<');
    var end = headerFrom.lastIndexOf('>');
    if (start > 0 && end > 0) {
      email = headerFrom.substring(start+1, end);
    }
  } catch(e) {
    logger.writeError("retrieveMadr(): " + e);
    throw e;
  }
  logger.writeDebug("end retrieveMadr");
  return email;
}


// 振分情報生成
// 指定フォルダのメール情報をファイル出力する
function createDistibutionManageInfo() {
  logger.writeDebug("start createDistibutionManageInfo");
  
  var count = 0;
  var percentage = 0;
  var inboxFolder;
  var database;

  try {
    var mailcount = getMailCount();
    var manageAry = new Array();
    var p_inbox = prefb.getIntPref("sender-distribution.condition.p_inbox");
    var p_status =prefb.getIntPref("sender-distribution.condition.p_status"); 
    inboxFolder = getInboxFolderByIndex(p_inbox);
    database = inboxFolder.msgDatabase;
    var enumerator = database.EnumerateMessages();

    // 前回処理で作った一覧ファイルを削除
    deleteDistibutionListFile();
    
    // 差出人メールアドレスを抽出
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
          // 見つけたメアドが管理ファイル未出力の場合
          var item = {author: author, count: 1};
          manageAry.push(item);
        } else {
          manageAry[index]['count']++;
        }
        count++;

        // 進捗率再計算
        if (isDebug) {
          percentage = Math.round((count / mailcount) * 100);
          logger.writeDebug(
            "count=" + count + ", mailcount=" + mailcount + ", percentage=" + percentage);
        }
      }
    }

    // 振分対象メール数保存
    prefb.setIntPref("sender-distribution.condition.mailcount", mailcount);

    // とりまとめたメール情報を管理ファイルに出力
    outputDistibutionManagerFile(manageAry, mailcount);

    var p_folder = prefb.getIntPref("sender-distribution.condition.p_folder");
    if (p_folder == 2) {
      // 振分先フォルダ名決定
      prefb.setCharPref("sender-distribution.condition.p_folder_name", getTime(2));
    }
  } catch(e) {
    logger.writeError("createDistibutionManageInfo(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  } finally {
    database = null;
    inboxFolder.msgDatabase = null;
  }
  logger.writeDebug("end createDistibutionManageInfo");
}

// 振分一覧ファイルを削除
function deleteDistibutionListFile() {
  logger.writeDebug("start deleteDistibutionListFile");
  try {
    var file = Components
        .classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(propd.path + getFileSeparator() + FILENAME_LIST);
    if (file.exists()) {
      file.remove(false);
      logger.writeInfo("deleted " + propd.path + getFileSeparator() + FILENAME_LIST);
    }
  } catch(e) {
    logger.writeError("deleteDistibutionListFile(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  logger.writeDebug("end deleteDistibutionListFile");
}


// 振分一覧ファイルを出力
function outputDistibutionListFile(header) {
  logger.writeDebug("start outputDistibutionListFile");

  var converterStream;
  var fileStream;
  try {
    var file = Components
        .classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(propd.path + getFileSeparator() + FILENAME_LIST);
    if (!file.exists()) {
      file.create(file.NORMAL_FILE_TYPE, 0666);
      logger.writeInfo("created "+ propd.path + getFileSeparator() + FILENAME_LIST);
    }
    fileStream = Components
        .classes['@mozilla.org/network/file-output-stream;1']
        .createInstance(Components.interfaces.nsIFileOutputStream);
    fileStream.init(file, 0x02 | 0x08 | 0x10, 0x664, false);

    converterStream = Components
        .classes['@mozilla.org/intl/converter-output-stream;1']
        .createInstance(Components.interfaces.nsIConverterOutputStream);
    converterStream.init(fileStream, CHARSET, 0,
        Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

    // ファイル出力
    converterStream.writeString(
      retrieveMadr(header.mime2DecodedAuthor) + "," + header.messageId + RTNCD);
  } catch(e) {
    logger.writeError("outputDistibutionListFile(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  } finally{
    if (converterStream != null) {
      converterStream.close();
    }
    if (fileStream != null) {
      fileStream.close();
    }
  }
  logger.writeDebug("end outputDistibutionListFile");
}

// メアド毎のメール件数を管理するファイルを出力
function outputDistibutionManagerFile(manageAry, mailcount) {
  logger.writeDebug("start outputDistibutionManagerFile");
  
  var converterStream;
  var fileStream;
  try {
    var file = Components
        .classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(propd.path + getFileSeparator() + FILENAME_MANAGER);
    if (file.exists()) {
      file.remove(false);
      logger.writeInfo("delete " + propd.path + getFileSeparator() + FILENAME_MANAGER);
    }
    file.create(file.NORMAL_FILE_TYPE, 0666);
  
    fileStream = Components
        .classes['@mozilla.org/network/file-output-stream;1']
        .createInstance(Components.interfaces.nsIFileOutputStream);
    // 0x10を含めないと、ファイルがreadonlyになってしまう
    fileStream.init(file, 0x02 | 0x08 | 0x10, 0x664, false);
  
    converterStream = Components
        .classes['@mozilla.org/intl/converter-output-stream;1']
        .createInstance(Components.interfaces.nsIConverterOutputStream);
    converterStream.init(fileStream, CHARSET, 0,
        Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

    // ファイル出力
    converterStream.writeString("totalcount=" + mailcount + RTNCD);
    for (var index=0;index<manageAry.length;index++) {
      // 差出人判定のみ実装
      converterStream.writeString("folder=" + manageAry[index]['author'] + RTNCD);
      converterStream.writeString("count=" + manageAry[index]['count'] + RTNCD);
    }
    
  } catch(e) {
    logger.writeError("outputDistibutionManagerFile(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  } finally{
    if (converterStream != null) {
      converterStream.close();
    }
    if (fileStream != null) {
      fileStream.close();
    }
  }
  logger.writeDebug("end outputDistibutionManagerFile");
}

// メアドとメアドIDの一覧ファイルを作成
function createDistibutionListInfo(manageAry) {
  logger.writeDebug("start createDistibutionListInfo");
  
  var inboxFolder;
  var database;

  try {
    var p_inbox = prefb.getIntPref("sender-distribution.condition.p_inbox");
    var p_status =prefb.getIntPref("sender-distribution.condition.p_status"); 
    inboxFolder = getInboxFolderByIndex(p_inbox);
    database = inboxFolder.msgDatabase;
    var enumerator = database.EnumerateMessages();
    
    // 入力条件に一致したメールの差出人と関数の引数で渡した差出人が
    // 一致したメールを振分対象メールとする
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
    logger.writeError("createDistibutionListInfo(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  } finally {
    database = null;
    inboxFolder.msgDatabase = null;
  }
  logger.writeDebug("end createDistibutionListInfo");
}

// 画面上に表示するメアド情報を管理ファイルから読み込む
function readDistibutionManagerFile() {
  logger.writeDebug("start readDistibutionManagerFile");

  var fileStream;
  var lis;
  try {
    var file = Components
      .classes['@mozilla.org/file/local;1']
      .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(propd.path + getFileSeparator() + FILENAME_MANAGER);
  
    fileStream = Components
        .classes['@mozilla.org/network/file-input-stream;1']
        .createInstance(Components.interfaces.nsIFileInputStream);
    fileStream.init(file, 1, 0, false);
  
    var CC = Components.Constructor;
    var ConverterInputStream = CC("@mozilla.org/intl/converter-input-stream;1",
                  "nsIConverterInputStream",
                  "init");
    lis = new ConverterInputStream(fileStream, CHARSET, 1024, 0x0);
    lis.QueryInterface(Components.interfaces.nsIUnicharLineInputStream);
  
    var folders = new Array();
    var folder = null;
    var totalcount;
    var isRead = false;  // 1件以上読めばtrueに更新
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
      
        // folder行読み込み時にfoler配列を初期化する
        folder = new Array();
        folder['folder'] = value.replace(/^folder=/g, '');
        folder['count'] = 0;
      } else if (value.match(/^count/)) {
        folder['count'] = value.split('=')[1];
      } else if (value.match(/^totalcount/)) {
        totalcount = value.split('=')[1];
        mailcount = prefb.getIntPref("sender-distribution.condition.mailcount");
        logger.writeInfo("mailcount=" + mailcount + ", totalcount=" + totalcount);
        if (mailcount != totalcount) {
          logger.writeError("mailcount is not equal to totalcount");
          throw stbundle.getLocalizedMessage("sndb.unmatch.count");
        }
      }
      if (cont == false && folder != null) {
        folders.push(folder);
      }
    } while(cont);
  } catch(e) {
    logger.writeError("readDistibutionManagerFile(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  } finally {
    if (lis != null) {
      lis.close();
    }
    if (fileStream != null) {
      fileStream.close();
    }
  }

  folders.sort(function(a, b){
    // メール件数降順 -> メールアドレス昇順でソート
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
  
  logger.writeDebug("end readDistibutionManagerFile");
  return folders;
}

// 振分情報表示
function getDistibutionInfo() {
  logger.writeDebug("start getDistibutionInfo");
  
  var managerAry = null;
  try {
    // 振り分けメールの有無判定
    managerAry = readDistibutionManagerFile();
    if (managerAry.length == 0) {
      logger.writeWarn("there are no mail by selected conditions.");
      alert(stbundle.getLocalizedMessage("sndb.info.nomail"));
    } 

  } catch(e) {
    logger.writeError("getDistibutionInfo(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  } finally {
    logger.writeDebug("end getDistibutionInfo");
  }
  return managerAry;
}

// 振分情報表示
function showDistibutionInfoList(managerAry) {
  logger.writeDebug("start showDistibutionInfo");
  
  try {
    var mailcount = getMailCount();
    var distinfo = document.getElementById("distinfo");
    distinfo.setAttribute("value", managerAry.length + "/" + mailcount);

    for(var index = 0;index < managerAry.length;index++) {
      // 振分情報をtreeに1行ずつ追加
      var folder = managerAry[index];
      appendDistributionListItem(index, folder);
    }
  } catch(e) {
    logger.writeError("showDistibutionInfo(): " + e);
    throw e;
  }
  return;
}

// リストでチェックされたメアドを取得
function getTargetMailAddress() {
  logger.writeDebug("start getTargetMailAddress");

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
        logger.writeDebug("email=" + email);

        mailAddrAry.push(email);
      }
    }
  } catch(e) {
    logger.writeError("getTargetMailAddress(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  
  logger.writeDebug("end getTargetMailAddress");
  return mailAddrAry;
}

// 対象メール件数を再計算
function recountTargetMail() {
  logger.writeDebug("start recountTargetMail");

  try {
    var listbox = document.getElementById("MailAddrListBox");
    var totalCnt = 0;
    var totalMailAdrCnt = 0;
  
    var rows = listbox.getElementsByTagNameNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treerow");
    
    for (var idx = 0;idx < rows.length;idx++) {
      // 行先頭要素のチェックボックス値を取得
      var chkValue = toBoolean(rows[idx].children[0].getAttribute('value'));
      logger.writeDebug("idx/value=" + idx + "/" + chkValue + "(" + typeof(chkValue) + ")");

      if (chkValue) {
        var cell = document.getElementById("mailaddr-" + idx);
        var email = cell.getAttribute('label');
        cell = document.getElementById("cnt-" + idx);
        var cnt = cell.getAttribute('label');
        logger.writeDebug("email/cnt=" + email + "/" +cnt);

        totalCnt+=parseInt(cnt, 10);
        totalMailAdrCnt++;
      }
    }

    var distinfo = document.getElementById("distinfo");
    distinfo.setAttribute("value", totalMailAdrCnt + "/" + totalCnt);
  } catch(e) {
    logger.writeError("recountTargetMail(): " + e);
    alert(e);
    forceFinish();
  }
  logger.writeDebug("end recountTargetMail");
}

// 振分実行
function doDistribution() {
  logger.writeDebug("start doDistribution");

  var fileStream;
  var lis;

  var isMove = false;
  var method = prefb.getIntPref("sender-distribution.condition.p_method");
  if (method == 2) {
    isMove = true
  }

  try {
    // ファイル読み込み準備
    var file = Components
      .classes['@mozilla.org/file/local;1']
      .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(propd.path + getFileSeparator() + FILENAME_LIST);
  
    fileStream = Components
      .classes['@mozilla.org/network/file-input-stream;1']
      .createInstance(Components.interfaces.nsIFileInputStream);
    fileStream.init(file, 1, 0, false);
  
    var CC = Components.Constructor;
    var ConverterInputStream = CC("@mozilla.org/intl/converter-input-stream;1",
                  "nsIConverterInputStream",
                  "init");
    lis = new ConverterInputStream(fileStream, CHARSET, 1024, 0x0);
    lis.QueryInterface(Components.interfaces.nsIUnicharLineInputStream);
  
    var count = 0;
    var out = {value: ""};
    var srcFolder =
      getInboxFolderByIndex(prefb.getIntPref("sender-distribution.condition.p_inbox"));
    logger.writeDebug("srcFolder.URI=" + srcFolder.URI);

    // メールコピー(移動)用APIの準備
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
    var subfolder_name = prefb.getCharPref("sender-distribution.condition.p_folder_name");
    if (srcFolder.containsChildNamed(subfolder_name) == false) {
      srcFolder.createSubfolder(subfolder_name, null);
      logger.writeInfo("created sub folder=" + subfolder_name);
    }
    dstBaseFolder = srcFolder.findSubFolder(subfolder_name);
    
    var database = srcFolder.msgDatabase;

    do {
      //
      // メール用データベースからメッセージIDを用いてメールヘッダ情報を取得し、
      // ヘッダ情報を用いてメールコピー(移動)を実行する
      //
      //
      // ===sender-distribution-list.txtの構成===
      // メールアドレス,メールヘッダID
      //  (同一メールアドレスに対し、ユニークなメールヘッダIDが自動で割り振られている)
      //

      out.value = "";
      var cont = lis.readLine(out);
      var record = out.value.split(',');
      
      if (dstBaseFolder.containsChildNamed(record[0]) == false) {
        dstBaseFolder.createSubfolder(record[0], null);
        logger.writeInfo("created sub folder=" + record[0]);
      }
      var dstFolder = dstBaseFolder.findSubFolder(record[0]);
      logger.writeDebug("folder=" + dstFolder.URI + ",msgid=" + record[1]);

      var msg = database.getMsgHdrForMessageID(record[1]);
      var array = Components.classes["@mozilla.org/array;1"]
              .createInstance(Components.interfaces.nsIMutableArray);
      array.appendElement(msg, false);
      
      copyService.CopyMessages(srcFolder, array, dstFolder, isMove, null, null, false);
      count++;

      if (isDebug) {
        // 進捗率再計算
        var percentage = (count / mailcount) * 100;
        logger.writeDebug("count=" + count + ", mailcount=" + mailcount + ", percentage=" + percentage);
      }
    } while(cont);
    alert(stbundle.getLocalizedMessage("sndb.finish"));
  } catch(e) {
    logger.writeError("doDistribution(): " + e);
    // エラー処理は呼び出し元に委ねる
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
  logger.writeDebug("end doDistribution");
  return;
}

// 振分確認画面で振分実行ボタン押下時に実行
function executeDistribution() {
  logger.writeDebug("start executeDistribution");

  try {
    // checkboxのチェック状態を取得
    var mailAddrAry = getTargetMailAddress();
    if (mailAddrAry.length == 0) {
      alert(stbundle.getLocalizedMessage("sndb.noselect"));
      return;
    }
  
    // リストファイル作成
    createDistibutionListInfo(mailAddrAry);

    doDistribution();
  
    // 振り分け情報を消去し、条件再入力を可能にする
    changeConditionBtn(false);
  } catch(e) {
    logger.writeError("executeDistribution(): " + e);
    forceFinish();
  }
  logger.writeDebug("end executeDistribution");
  return;
}

// 振分情報内訳を全削除する
function clearListItems() {
  logger.writeDebug("start clearListItems");
  try {
    var treechild = document.getElementById("tc");
    while (treechild.firstChild) {
      treechild.removeChild(treechild.firstChild);
    }
    document.getElementById("distinfo").setAttribute("value", "-/-");
  } catch(e) {
    logger.writeError("clearListItems(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  logger.writeDebug("end clearListItems");
}

// 振分情報詳細に振分情報を追加する
function appendDistributionListItem(idx, folder) {
  logger.writeDebug("start appendDistributionListItem");
  logger.writeDebug("idx=" + idx);
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
    var p_folder = prefb.getIntPref("sender-distribution.condition.p_folder");
    if (p_folder == 1) {
      folder_name =
        stbundle.getLocalizedMessage("sndb.inbox.title")
        + getFileSeparator() + folder['folder'];
    } else {
      folder_name =
        stbundle.getLocalizedMessage("sndb.inbox.title")
        + getFileSeparator()
        + prefb.getCharPref("sender-distribution.condition.p_folder_name")
        + getFileSeparator() + folder['folder'];
    }
    cellFolder.setAttribute('id', "folder-" + idx);
    cellFolder.setAttribute('label', folder_name);
    cellFolder.setAttribute('tooltiptext', folder_name);
    cellFolder.setAttribute('crop', "end");
    cellFolder.setAttribute('editable', false);

    logger.writeDebug(
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
  
    // テーブル末尾に行を追加
    treechild.appendChild(valueItem);

    logger.writeDebug(
      "addr=" + folder['folder'] + ",count=" + folder['count'] + ",dstfolder=" + folder_name);
  } catch(e) {
    logger.writeError("appendDistributionListItem(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  logger.writeDebug("end appendDistributionListItem");
}


// チェックボックス一括選択
function changeAllCheckboxStatus() {
  logger.writeDebug("start changeAllCheckboxStatus");
  try {
    var listbox = document.getElementById("MailAddrListBox");
    var rows = listbox.getElementsByTagNameNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "treerow");

    for (var idx = 0;idx < rows.length;idx++) {
      var chkbox = document.getElementById("chk-" + idx);
      chkbox.setAttribute('value', chkBoxStatus);
      logger.writeDebug("chkbox idx/status = " + idx + "/" + chkBoxStatus);
    }

    chkBoxStatus = !chkBoxStatus;
  } catch(e) {
    logger.writeError("changeAllCheckboxStatus(): " + e);
    // エラー処理は呼び出し元に委ねる
    throw e;
  }
  logger.writeDebug("end changeAllCheckboxStatus");
}

function resetProp() {
  logger.writeDebug("start resetProp");
  try {
    prefb.setIntPref("sender-distribution.running", -1);
    prefb.setIntPref("sender-distribution.condition.p_inbox", -1);
    prefb.setIntPref("sender-distribution.condition.p_folder", -1);
    prefb.setCharPref("sender-distribution.condition.p_folder_name", "");
    prefb.setIntPref("sender-distribution.condition.p_status", -1);
    prefb.setIntPref("sender-distribution.condition.p_method", -1);
    prefb.setIntPref("sender-distribution.condition.p_edit_status", -1);
    prefb.setIntPref("sender-distribution.condition.mailcount", -1);    
  } catch(e) {
    logger.writeError("resetProp(): " + e);
  }
  logger.writeDebug("end resetProp");

}

// 強制終了
function forceFinish() {
  logger.writeDebug("start forceFinish");
  resetProp();
  logger.writeDebug("end forceFinish");
  window.close();
}
