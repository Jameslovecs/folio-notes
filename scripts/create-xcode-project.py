"""Generate a dependency-free Xcode project for the shared SwiftUI/WebKit app."""
from pathlib import Path
import plistlib
root=Path(__file__).resolve().parents[1]/'native'
project=root/'Folio.xcodeproj';project.mkdir(exist_ok=True)
plist={'CFBundleName':'Folio','CFBundleDisplayName':'Folio','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.0.0','CFBundleVersion':'1','WKAppBoundDomains':['folio-notes-james.jajamjamjamijamiejamie.chatgpt.site'],'UILaunchScreen':{},'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False},'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],'LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True}
(root/'Info.plist').write_bytes(plistlib.dumps(plist))
pbx='''// !$*UTF8*$!
{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {
 A00000000000000000000001 = {isa = PBXProject; buildConfigurationList = A00000000000000000000002; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en, Base); mainGroup = A00000000000000000000003; productRefGroup = A00000000000000000000004; projectDirPath = ""; projectRoot = ""; targets = (A00000000000000000000010,A00000000000000000000020); };
 A00000000000000000000002 = {isa = XCConfigurationList; buildConfigurations = (A00000000000000000000005,A00000000000000000000006); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;};
 A00000000000000000000003 = {isa = PBXGroup; children = (A00000000000000000000007,A00000000000000000000004); sourceTree = "<group>";};
 A00000000000000000000004 = {isa = PBXGroup; children = (A00000000000000000000018,A00000000000000000000028); name = Products; sourceTree = "<group>";};
 A00000000000000000000005 = {isa = XCBuildConfiguration; buildSettings = {SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES;}; name = Debug;};
 A00000000000000000000006 = {isa = XCBuildConfiguration; buildSettings = {SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES; SWIFT_OPTIMIZATION_LEVEL = "-O";}; name = Release;};
 A00000000000000000000007 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FolioApp.swift; sourceTree = "<group>";};
'''
for n,name,platform,extra in [('1','FolioMac','macosx','MACOSX_DEPLOYMENT_TARGET = 13.0;'),('2','FolioIOS','iphoneos','IPHONEOS_DEPLOYMENT_TARGET = 17.0; TARGETED_DEVICE_FAMILY = "1,2"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";')]:
 def id(v):return 'A000000000000000000000'+n+v
 pbx+=f'''
 {id('0')} = {{isa = PBXNativeTarget; buildConfigurationList = {id('1')}; buildPhases = ({id('2')},{id('3')},{id('4')}); buildRules = (); dependencies = (); name = {name}; productName = Folio; productReference = {id('8')}; productType = "com.apple.product-type.application";}};
 {id('1')} = {{isa = XCConfigurationList; buildConfigurations = ({id('5')},{id('6')}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;}};
 {id('2')} = {{isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({id('7')}); runOnlyForDeploymentPostprocessing = 0;}};
 {id('3')} = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;}};
 {id('4')} = {{isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;}};
 {id('7')} = {{isa = PBXBuildFile; fileRef = A00000000000000000000007;}};
 {id('8')} = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = {name}.app; sourceTree = BUILT_PRODUCTS_DIR;}};
'''
 for conf,num in [('Debug','5'),('Release','6')]:
  pbx+=f'''{id(num)} = {{isa = XCBuildConfiguration; buildSettings = {{PRODUCT_NAME = {name}; PRODUCT_BUNDLE_IDENTIFIER = com.jameslovecs.{name.lower()}; INFOPLIST_FILE = Info.plist; GENERATE_INFOPLIST_FILE = NO; CODE_SIGN_STYLE = Automatic; SDKROOT = {platform}; ENABLE_HARDENED_RUNTIME = YES; {extra}}}; name = {conf};}};\n'''
pbx+='}; rootObject = A00000000000000000000001;}'
(project/'project.pbxproj').write_text(pbx)
print(project)
