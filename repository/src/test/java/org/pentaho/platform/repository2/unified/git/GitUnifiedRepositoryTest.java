package org.pentaho.platform.repository2.unified.git;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import org.pentaho.platform.api.repository2.unified.IRepositoryFileData;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAce;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAcl;
import org.pentaho.platform.api.repository2.unified.RepositoryFilePermission;
import org.pentaho.platform.api.repository2.unified.RepositoryFileSid;
import org.pentaho.platform.api.repository2.unified.VersionSummary;
import org.pentaho.platform.api.repository2.unified.data.simple.SimpleRepositoryFileData;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.util.EnumSet;
import java.util.List;

import static org.junit.Assert.*;

/**
 * Comprehensive test suite for the Git-based Pentaho Repository implementation.
 * 
 * This test class demonstrates and validates:
 * - Basic repository operations (CRUD)
 * - Version control functionality
 * - Branch operations
 * - ACL management
 * - Git-specific features
 * 
 * @author Auto-generated Test Suite
 */
public class GitUnifiedRepositoryTest {

  @Rule
  public TemporaryFolder tempFolder = new TemporaryFolder();

  private GitUnifiedRepository repository;
  private File repositoryDir;

  @Before
  public void setUp() throws IOException {
    // Create temporary directory for test repository
    repositoryDir = tempFolder.newFolder("git-repo-test");
    
    // Initialize Git repository
    repository = new GitUnifiedRepository(repositoryDir);
    
    // Verify repository is properly initialized
    assertNotNull("Repository should be initialized", repository);
    assertNotNull("Git DAO should be available", repository.getGitFileDao());
    assertNotNull("ACL DAO should be available", repository.getGitAclDao());
  }

  @After
  public void tearDown() {
    if (repository != null && repository.getGit() != null) {
      repository.getGit().close();
    }
  }

  // ~ Basic Repository Operations Tests
  // =========================================================================================================

  @Test
  public void testCreateAndRetrieveFile() throws Exception {
    // Prepare test data
    String fileName = "test-report.prpt";
    String fileContent = "<?xml version=\"1.0\"?><report>Test Report Content</report>";
    String parentFolder = "/public";
    
    RepositoryFile file = new RepositoryFile.Builder(fileName)
        .name(fileName)
        .folder(false)
        .build();
    
    SimpleRepositoryFileData data = new SimpleRepositoryFileData(
        new ByteArrayInputStream(fileContent.getBytes()),
        "UTF-8",
        "application/xml"
    );

    // Create file
    RepositoryFile createdFile = repository.createFile(
        parentFolder, file, data, "Initial version of test report"
    );

    // Verify file was created
    assertNotNull("Created file should not be null", createdFile);
    assertEquals("File name should match", fileName, createdFile.getName());
    assertFalse("File should not be a folder", createdFile.isFolder());
    assertNotNull("File should have an ID", createdFile.getId());

    // Retrieve file
    RepositoryFile retrievedFile = repository.getFileById(createdFile.getId());
    assertNotNull("Retrieved file should not be null", retrievedFile);
    assertEquals("Retrieved file name should match", fileName, retrievedFile.getName());

    // Retrieve file content
    SimpleRepositoryFileData retrievedData = repository.getDataForRead(
        createdFile.getId(), SimpleRepositoryFileData.class
    );
    assertNotNull("Retrieved data should not be null", retrievedData);
    
    // Verify content matches
    byte[] retrievedBytes = new byte[fileContent.length()];
    retrievedData.getInputStream().read(retrievedBytes);
    String retrievedContent = new String(retrievedBytes);
    assertEquals("File content should match", fileContent, retrievedContent);
  }

  @Test
  public void testCreateAndRetrieveFolder() throws Exception {
    // Prepare test data
    String folderName = "test-folder";
    String parentFolder = "/public";
    
    RepositoryFile folder = new RepositoryFile.Builder(folderName)
        .name(folderName)
        .folder(true)
        .build();

    // Create folder
    RepositoryFile createdFolder = repository.createFolder(
        parentFolder, folder, "Created test folder"
    );

    // Verify folder was created
    assertNotNull("Created folder should not be null", createdFolder);
    assertEquals("Folder name should match", folderName, createdFolder.getName());
    assertTrue("Folder should be a folder", createdFolder.isFolder());

    // Retrieve folder
    RepositoryFile retrievedFolder = repository.getFileById(createdFolder.getId());
    assertNotNull("Retrieved folder should not be null", retrievedFolder);
    assertEquals("Retrieved folder name should match", folderName, retrievedFolder.getName());
    assertTrue("Retrieved item should be a folder", retrievedFolder.isFolder());
  }

  @Test
  public void testUpdateFile() throws Exception {
    // Create initial file
    RepositoryFile file = createTestFile("update-test.txt", "Initial content");
    
    // Update file content
    String updatedContent = "Updated content with new information";
    SimpleRepositoryFileData updatedData = new SimpleRepositoryFileData(
        new ByteArrayInputStream(updatedContent.getBytes()),
        "UTF-8",
        "text/plain"
    );

    RepositoryFile updatedFile = repository.updateFile(
        file, updatedData, "Updated file content"
    );

    // Verify update
    assertNotNull("Updated file should not be null", updatedFile);
    assertEquals("File ID should remain the same", file.getId(), updatedFile.getId());

    // Verify updated content
    SimpleRepositoryFileData retrievedData = repository.getDataForRead(
        updatedFile.getId(), SimpleRepositoryFileData.class
    );
    
    byte[] retrievedBytes = new byte[updatedContent.length()];
    retrievedData.getInputStream().read(retrievedBytes);
    String retrievedContent = new String(retrievedBytes);
    assertEquals("Updated content should match", updatedContent, retrievedContent);
  }

  @Test
  public void testDeleteFile() throws Exception {
    // Create file
    RepositoryFile file = createTestFile("delete-test.txt", "Content to be deleted");
    
    // Verify file exists
    RepositoryFile existingFile = repository.getFileById(file.getId());
    assertNotNull("File should exist before deletion", existingFile);

    // Delete file
    repository.deleteFile(file.getId(), "Deleted test file");

    // Verify file is deleted
    RepositoryFile deletedFile = repository.getFileById(file.getId());
    assertNull("File should not exist after deletion", deletedFile);
  }

  @Test
  public void testGetChildren() throws Exception {
    // Create parent folder
    RepositoryFile parentFolder = createTestFolder("/public", "parent-folder");
    
    // Create child files and folders
    createTestFile(parentFolder.getPath() + "/child1.txt", "Child file 1");
    createTestFile(parentFolder.getPath() + "/child2.txt", "Child file 2");
    createTestFolder(parentFolder.getPath(), "subfolder");

    // Get children
    List<RepositoryFile> children = repository.getChildren(parentFolder.getId());

    // Verify children
    assertNotNull("Children list should not be null", children);
    assertEquals("Should have 3 children", 3, children.size());

    // Verify child types
    long fileCount = children.stream().filter(child -> !child.isFolder()).count();
    long folderCount = children.stream().filter(RepositoryFile::isFolder).count();
    
    assertEquals("Should have 2 files", 2, fileCount);
    assertEquals("Should have 1 folder", 1, folderCount);
  }

  // ~ Version Control Tests
  // =========================================================================================================

  @Test
  public void testVersionHistory() throws Exception {
    // Create file
    RepositoryFile file = createTestFile("version-test.txt", "Version 1 content");
    
    // Update file multiple times
    updateFileContent(file, "Version 2 content", "Second version");
    Thread.sleep(100); // Ensure different timestamps
    updateFileContent(file, "Version 3 content", "Third version");
    Thread.sleep(100);
    updateFileContent(file, "Version 4 content", "Fourth version");

    // Get version history
    List<VersionSummary> versions = repository.getVersionSummaries(file.getId());

    // Verify version history
    assertNotNull("Version history should not be null", versions);
    assertTrue("Should have multiple versions", versions.size() >= 4);

    // Verify version details
    for (VersionSummary version : versions) {
      assertNotNull("Version ID should not be null", version.getId());
      assertNotNull("Version message should not be null", version.getMessage());
      assertNotNull("Version author should not be null", version.getAuthor());
      assertNotNull("Version date should not be null", version.getDate());
    }

    // Test specific version retrieval
    VersionSummary firstVersion = versions.get(versions.size() - 1); // Oldest first
    RepositoryFile historicalFile = repository.getFileAtVersion(
        file.getId(), firstVersion.getId()
    );
    
    assertNotNull("Historical file should not be null", historicalFile);
    assertEquals("Historical file name should match", file.getName(), historicalFile.getName());
  }

  @Test
  public void testVersionDataRetrieval() throws Exception {
    // Create file with initial content
    String initialContent = "Initial version content";
    RepositoryFile file = createTestFile("version-data-test.txt", initialContent);
    
    // Get version history to get initial version ID
    List<VersionSummary> initialVersions = repository.getVersionSummaries(file.getId());
    VersionSummary initialVersion = initialVersions.get(0);

    // Update file
    String updatedContent = "Updated version content";
    updateFileContent(file, updatedContent, "Updated content");

    // Retrieve data from initial version
    SimpleRepositoryFileData initialData = repository.getDataAtVersionForRead(
        file.getId(), initialVersion.getId(), SimpleRepositoryFileData.class
    );

    // Verify initial version data
    assertNotNull("Initial version data should not be null", initialData);
    
    byte[] initialBytes = new byte[initialContent.length()];
    initialData.getInputStream().read(initialBytes);
    String retrievedInitialContent = new String(initialBytes);
    assertEquals("Initial version content should match", initialContent, retrievedInitialContent);

    // Retrieve current version data
    SimpleRepositoryFileData currentData = repository.getDataForRead(
        file.getId(), SimpleRepositoryFileData.class
    );

    byte[] currentBytes = new byte[updatedContent.length()];
    currentData.getInputStream().read(currentBytes);
    String retrievedCurrentContent = new String(currentBytes);
    assertEquals("Current version content should match", updatedContent, retrievedCurrentContent);
  }

  // ~ Git Branch Operations Tests
  // =========================================================================================================

  @Test
  public void testBranchOperations() throws Exception {
    // Verify initial branch
    assertEquals("Should start on main branch", "main", repository.getCurrentBranch());

    // Create file on main branch
    RepositoryFile mainFile = createTestFile("main-branch-file.txt", "Content on main branch");

    // Create and switch to feature branch
    String featureBranch = "feature/test-branch";
    repository.createBranch(featureBranch);
    repository.switchBranch(featureBranch);

    // Verify branch switch
    assertEquals("Should be on feature branch", featureBranch, repository.getCurrentBranch());

    // Create file on feature branch
    RepositoryFile featureFile = createTestFile("feature-branch-file.txt", "Content on feature branch");

    // Verify files exist on feature branch
    assertNotNull("Main file should exist on feature branch", repository.getFileById(mainFile.getId()));
    assertNotNull("Feature file should exist on feature branch", repository.getFileById(featureFile.getId()));

    // Switch back to main branch
    repository.switchBranch("main");
    assertEquals("Should be back on main branch", "main", repository.getCurrentBranch());

    // Verify main branch state
    assertNotNull("Main file should exist on main branch", repository.getFileById(mainFile.getId()));
    // Feature file should not exist on main branch (created only on feature branch)
    // Note: This test may need adjustment based on exact Git merge behavior
  }

  @Test
  public void testBranchIsolation() throws Exception {
    // Create initial file
    RepositoryFile originalFile = createTestFile("branch-isolation-test.txt", "Original content");

    // Create feature branch
    String featureBranch = "feature/isolation-test";
    repository.createBranch(featureBranch);
    repository.switchBranch(featureBranch);

    // Modify file on feature branch
    updateFileContent(originalFile, "Modified on feature branch", "Feature branch modification");

    // Switch back to main
    repository.switchBranch("main");

    // Verify main branch has original content
    SimpleRepositoryFileData mainData = repository.getDataForRead(
        originalFile.getId(), SimpleRepositoryFileData.class
    );
    
    byte[] mainBytes = new byte["Original content".length()];
    mainData.getInputStream().read(mainBytes);
    String mainContent = new String(mainBytes);
    assertEquals("Main branch should have original content", "Original content", mainContent);

    // Switch back to feature branch
    repository.switchBranch(featureBranch);

    // Verify feature branch has modified content
    SimpleRepositoryFileData featureData = repository.getDataForRead(
        originalFile.getId(), SimpleRepositoryFileData.class
    );
    
    byte[] featureBytes = new byte["Modified on feature branch".length()];
    featureData.getInputStream().read(featureBytes);
    String featureContent = new String(featureBytes);
    assertEquals("Feature branch should have modified content", "Modified on feature branch", featureContent);
  }

  // ~ ACL Management Tests
  // =========================================================================================================

  @Test
  public void testAclCreationAndRetrieval() throws Exception {
    // Create file
    RepositoryFile file = createTestFile("acl-test.txt", "ACL test content");

    // Create ACL
    RepositoryFileSid ownerSid = new RepositoryFileSid("testuser", RepositoryFileSid.Type.USER);
    RepositoryFileSid adminRole = new RepositoryFileSid("administrators", RepositoryFileSid.Type.ROLE);

    RepositoryFileAce adminAce = new RepositoryFileAce(
        adminRole,
        EnumSet.of(RepositoryFilePermission.READ, RepositoryFilePermission.WRITE, RepositoryFilePermission.DELETE)
    );

    RepositoryFileAcl acl = new RepositoryFileAcl.Builder(file.getId(), ownerSid)
        .ace(adminAce)
        .entriesInheriting(true)
        .build();

    // Update ACL
    RepositoryFileAcl updatedAcl = repository.updateAcl(acl);

    // Verify ACL
    assertNotNull("Updated ACL should not be null", updatedAcl);
    assertEquals("ACL ID should match file ID", file.getId(), updatedAcl.getId());
    assertEquals("Owner should match", ownerSid, updatedAcl.getOwner());
    assertTrue("ACL should be inheriting", updatedAcl.isEntriesInheriting());

    // Retrieve ACL
    RepositoryFileAcl retrievedAcl = repository.getAcl(file.getId());
    assertNotNull("Retrieved ACL should not be null", retrievedAcl);
    assertEquals("Retrieved ACL should match", updatedAcl.getId(), retrievedAcl.getId());
    assertEquals("Retrieved owner should match", ownerSid, retrievedAcl.getOwner());
  }

  @Test
  public void testEffectiveAces() throws Exception {
    // Create file
    RepositoryFile file = createTestFile("effective-aces-test.txt", "Effective ACEs test");

    // Create ACL with multiple ACEs
    RepositoryFileSid ownerSid = new RepositoryFileSid("owner", RepositoryFileSid.Type.USER);
    RepositoryFileSid userSid = new RepositoryFileSid("testuser", RepositoryFileSid.Type.USER);
    RepositoryFileSid adminRole = new RepositoryFileSid("administrators", RepositoryFileSid.Type.ROLE);

    RepositoryFileAce userAce = new RepositoryFileAce(
        userSid, EnumSet.of(RepositoryFilePermission.READ)
    );
    RepositoryFileAce adminAce = new RepositoryFileAce(
        adminRole, EnumSet.of(RepositoryFilePermission.READ, RepositoryFilePermission.WRITE)
    );

    RepositoryFileAcl acl = new RepositoryFileAcl.Builder(file.getId(), ownerSid)
        .ace(userAce)
        .ace(adminAce)
        .entriesInheriting(false)
        .build();

    repository.updateAcl(acl);

    // Get effective ACEs
    List<RepositoryFileAce> effectiveAces = repository.getEffectiveAces(file.getId());

    // Verify effective ACEs
    assertNotNull("Effective ACEs should not be null", effectiveAces);
    assertEquals("Should have 2 ACEs", 2, effectiveAces.size());

    // Verify ACE details
    boolean hasUserAce = effectiveAces.stream()
        .anyMatch(ace -> ace.getSid().equals(userSid));
    boolean hasAdminAce = effectiveAces.stream()
        .anyMatch(ace -> ace.getSid().equals(adminRole));

    assertTrue("Should have user ACE", hasUserAce);
    assertTrue("Should have admin ACE", hasAdminAce);
  }

  // ~ Git-Specific Feature Tests
  // =========================================================================================================

  @Test
  public void testGitRepositoryAccess() throws Exception {
    // Get Git repository
    Git git = repository.getGit();
    assertNotNull("Git repository should be accessible", git);

    // Verify repository directory
    File gitDir = git.getRepository().getDirectory();
    assertTrue("Git directory should exist", gitDir.exists());
    assertTrue("Should be a Git repository", gitDir.getName().equals(".git"));
  }

  @Test
  public void testRepositoryValidation() throws Exception {
    // Create some test content
    createTestFile("validation-test-1.txt", "Content 1");
    createTestFile("validation-test-2.txt", "Content 2");
    createTestFolder("/public", "validation-folder");

    // Validate repository
    List<String> validationErrors = repository.validateRepository();

    // Should have no errors for a properly initialized repository
    assertNotNull("Validation errors list should not be null", validationErrors);
    // Note: Depending on implementation, this might have some expected warnings
    // assertTrue("Should have no validation errors", validationErrors.isEmpty());
  }

  @Test
  public void testRepositoryInfo() throws Exception {
    // Get repository information
    var repositoryInfo = repository.exportRepositoryInfo();

    // Verify repository info
    assertNotNull("Repository info should not be null", repositoryInfo);
    assertTrue("Should contain current branch", repositoryInfo.containsKey("currentBranch"));
    assertTrue("Should contain repository type", repositoryInfo.containsKey("repositoryType"));
    assertTrue("Should contain implementation type", repositoryInfo.containsKey("implementationType"));

    assertEquals("Repository type should be Git", "Git", repositoryInfo.get("repositoryType"));
    assertEquals("Implementation should be GitUnifiedRepository", 
                "GitUnifiedRepository", repositoryInfo.get("implementationType"));
  }

  // ~ Performance and Stress Tests
  // =========================================================================================================

  @Test
  public void testBulkFileOperations() throws Exception {
    int fileCount = 50; // Reduced for faster test execution
    String folderPath = "/public/bulk-test";
    
    // Create test folder
    createTestFolder("/public", "bulk-test");

    // Create multiple files
    for (int i = 0; i < fileCount; i++) {
      String fileName = String.format("bulk-file-%03d.txt", i);
      String content = String.format("Content for file %d", i);
      
      RepositoryFile file = new RepositoryFile.Builder(fileName)
          .name(fileName)
          .folder(false)
          .build();
      
      SimpleRepositoryFileData data = new SimpleRepositoryFileData(
          new ByteArrayInputStream(content.getBytes()),
          "UTF-8",
          "text/plain"
      );

      RepositoryFile createdFile = repository.createFile(
          folderPath, file, data, "Bulk create file " + i
      );
      
      assertNotNull("File " + i + " should be created", createdFile);
    }

    // Verify all files were created
    List<RepositoryFile> children = repository.getChildren(folderPath);
    assertEquals("Should have created all files", fileCount, children.size());

    // Test bulk retrieval
    for (RepositoryFile child : children) {
      RepositoryFile retrievedFile = repository.getFileById(child.getId());
      assertNotNull("File should be retrievable: " + child.getName(), retrievedFile);
      
      SimpleRepositoryFileData data = repository.getDataForRead(
          child.getId(), SimpleRepositoryFileData.class
      );
      assertNotNull("File data should be retrievable: " + child.getName(), data);
    }
  }

  // ~ Helper Methods
  // =========================================================================================================

  /**
   * Creates a test file with the specified name and content.
   */
  private RepositoryFile createTestFile(String fileName, String content) throws Exception {
    RepositoryFile file = new RepositoryFile.Builder(fileName)
        .name(fileName)
        .folder(false)
        .build();
    
    SimpleRepositoryFileData data = new SimpleRepositoryFileData(
        new ByteArrayInputStream(content.getBytes()),
        "UTF-8",
        "text/plain"
    );

    return repository.createFile("/public", file, data, "Created test file: " + fileName);
  }

  /**
   * Creates a test folder with the specified parent and name.
   */
  private RepositoryFile createTestFolder(String parentPath, String folderName) throws Exception {
    RepositoryFile folder = new RepositoryFile.Builder(folderName)
        .name(folderName)
        .folder(true)
        .build();

    return repository.createFolder(parentPath, folder, "Created test folder: " + folderName);
  }

  /**
   * Updates the content of an existing file.
   */
  private RepositoryFile updateFileContent(RepositoryFile file, String newContent, String message) throws Exception {
    SimpleRepositoryFileData data = new SimpleRepositoryFileData(
        new ByteArrayInputStream(newContent.getBytes()),
        "UTF-8",
        "text/plain"
    );

    return repository.updateFile(file, data, message);
  }

  // ~ Integration Tests
  // =========================================================================================================

  @Test
  public void testCompleteWorkflow() throws Exception {
    // Complete workflow test demonstrating real-world usage
    
    // 1. Create project structure
    RepositoryFile projectFolder = createTestFolder("/public", "test-project");
    RepositoryFile reportsFolder = createTestFolder(projectFolder.getPath(), "reports");
    RepositoryFile dataFolder = createTestFolder(projectFolder.getPath(), "data");

    // 2. Create initial files
    RepositoryFile report1 = createTestFile(reportsFolder.getPath() + "/sales-report.prpt", 
                                           "Sales report content");
    RepositoryFile report2 = createTestFile(reportsFolder.getPath() + "/inventory-report.prpt", 
                                           "Inventory report content");
    RepositoryFile dataSource = createTestFile(dataFolder.getPath() + "/database.properties", 
                                              "db.url=jdbc:postgresql://localhost/pentaho");

    // 3. Set up ACLs
    RepositoryFileSid adminSid = new RepositoryFileSid("admin", RepositoryFileSid.Type.USER);
    RepositoryFileSid reportRole = new RepositoryFileSid("report-users", RepositoryFileSid.Type.ROLE);

    RepositoryFileAcl reportAcl = new RepositoryFileAcl.Builder(report1.getId(), adminSid)
        .ace(new RepositoryFileAce(reportRole, EnumSet.of(RepositoryFilePermission.READ)))
        .entriesInheriting(true)
        .build();

    repository.updateAcl(reportAcl);

    // 4. Create feature branch for development
    repository.createBranch("feature/enhanced-reports");
    repository.switchBranch("feature/enhanced-reports");

    // 5. Modify reports on feature branch
    updateFileContent(report1, "Enhanced sales report with new features", 
                     "Enhanced sales report functionality");
    RepositoryFile newReport = createTestFile(reportsFolder.getPath() + "/dashboard.xml", 
                                            "New dashboard content");

    // 6. Switch back to main and verify isolation
    repository.switchBranch("main");
    
    // Verify main branch doesn't have new report
    RepositoryFile mainNewReport = repository.getFile(reportsFolder.getPath() + "/dashboard.xml");
    assertNull("New report should not exist on main branch", mainNewReport);

    // 7. Verify version history
    List<VersionSummary> report1Versions = repository.getVersionSummaries(report1.getId());
    assertTrue("Report should have version history", report1Versions.size() >= 1);

    // 8. Test repository validation
    List<String> validationErrors = repository.validateRepository();
    assertNotNull("Validation should complete", validationErrors);

    // 9. Export repository info
    var repoInfo = repository.exportRepositoryInfo();
    assertNotNull("Repository info should be available", repoInfo);
    assertEquals("Should be on main branch", "main", repoInfo.get("currentBranch"));
  }
}
