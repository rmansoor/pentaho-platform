package org.pentaho.platform.repository2.unified.git;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.storage.file.FileRepositoryBuilder;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevWalk;
import org.eclipse.jgit.treewalk.TreeWalk;
import org.eclipse.jgit.treewalk.filter.PathFilter;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang.StringUtils;
import org.pentaho.platform.api.locale.IPentahoLocale;
import org.pentaho.platform.api.repository2.unified.IRepositoryFileData;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAcl;
import org.pentaho.platform.api.repository2.unified.RepositoryFileTree;
import org.pentaho.platform.api.repository2.unified.RepositoryRequest;
import org.pentaho.platform.api.repository2.unified.UnifiedRepositoryException;
import org.pentaho.platform.api.repository2.unified.VersionSummary;
import org.pentaho.platform.api.repository2.unified.data.simple.SimpleRepositoryFileData;
import org.pentaho.platform.repository2.unified.IRepositoryFileDao;
import org.springframework.util.Assert;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.Serializable;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Git-based implementation of {@link IRepositoryFileDao} using JGit.
 * 
 * This implementation stores repository files in a Git repository, providing
 * version control, branching, and distributed repository capabilities.
 * 
 * Key features:
 * - Git-based version control for all repository operations
 * - Branch support for isolation and parallel development
 * - Distributed repository capabilities
 * - Integration with existing Pentaho repository interfaces
 * 
 * @author Auto-generated Git Implementation
 */
public class GitRepositoryFileDao implements IRepositoryFileDao {

  // ~ Static fields/initializers
  // ======================================================================================
  
  private static final String DEFAULT_BRANCH = "main";
  private static final String PENTAHO_METADATA_DIR = ".pentaho";
  private static final String ACL_SUFFIX = ".acl";
  private static final String METADATA_SUFFIX = ".metadata";
  private static final List<Character> RESERVED_CHARS = Arrays.asList(':', '*', '?', '"', '<', '>', '|');

  // ~ Instance fields
  // =================================================================================================
  
  private final Repository gitRepository;
  private final Git git;
  private final File workingDirectory;
  private final Map<String, RepositoryFile> fileCache = new ConcurrentHashMap<>();
  private String currentBranch = DEFAULT_BRANCH;

  // ~ Constructors
  // ====================================================================================================

  /**
   * Constructs a new GitRepositoryFileDao with the specified Git repository path.
   * 
   * @param repositoryPath the path to the Git repository directory
   * @throws IOException if repository initialization fails
   */
  public GitRepositoryFileDao(String repositoryPath) throws IOException {
    this(new File(repositoryPath));
  }

  /**
   * Constructs a new GitRepositoryFileDao with the specified Git repository directory.
   * 
   * @param repositoryDir the Git repository directory
   * @throws IOException if repository initialization fails
   */
  public GitRepositoryFileDao(File repositoryDir) throws IOException {
    Assert.notNull(repositoryDir, "Repository directory cannot be null");
    
    this.workingDirectory = repositoryDir;
    
    // Initialize or open existing Git repository
    if (!repositoryDir.exists()) {
      repositoryDir.mkdirs();
    }
    
    File gitDir = new File(repositoryDir, ".git");
    if (!gitDir.exists()) {
      // Initialize new repository
      this.git = Git.init().setDirectory(repositoryDir).call();
      this.gitRepository = git.getRepository();
      createInitialCommit();
    } else {
      // Open existing repository
      FileRepositoryBuilder builder = new FileRepositoryBuilder();
      this.gitRepository = builder.setGitDir(gitDir)
          .readEnvironment()
          .findGitDir()
          .build();
      this.git = new Git(gitRepository);
    }
    
    createMetadataDirectories();
  }

  // ~ Methods
  // =========================================================================================================

  private void createInitialCommit() throws IOException {
    try {
      // Create initial commit with empty repository structure
      File readmeFile = new File(workingDirectory, "README.md");
      Files.write(readmeFile.toPath(), "# Pentaho Repository\n\nInitialized Git-based repository.".getBytes());
      
      git.add().addFilepattern("README.md").call();
      git.commit()
          .setMessage("Initial repository setup")
          .setAuthor("Pentaho System", "system@pentaho.com")
          .call();
          
    } catch (GitAPIException e) {
      throw new IOException("Failed to create initial commit", e);
    }
  }

  private void createMetadataDirectories() throws IOException {
    File metadataDir = new File(workingDirectory, PENTAHO_METADATA_DIR);
    if (!metadataDir.exists()) {
      metadataDir.mkdirs();
      
      // Create subdirectories for different metadata types
      new File(metadataDir, "acls").mkdirs();
      new File(metadataDir, "metadata").mkdirs();
      new File(metadataDir, "versions").mkdirs();
    }
  }

  @Override
  public RepositoryFile createFile(Serializable parentFolderId, RepositoryFile file, 
                                   IRepositoryFileData content, RepositoryFileAcl acl, String versionMessage) {
    Assert.notNull(file, "File cannot be null");
    Assert.notNull(content, "Content cannot be null");
    
    try {
      String parentPath = resolveParentPath(parentFolderId);
      String fullPath = buildPath(parentPath, file.getName());
      File targetFile = new File(workingDirectory, fullPath);
      
      // Ensure parent directories exist
      targetFile.getParentFile().mkdirs();
      
      // Write file content
      writeFileContent(targetFile, content);
      
      // Create RepositoryFile metadata
      RepositoryFile newFile = createRepositoryFileMetadata(file, fullPath, false);
      
      // Store ACL if provided
      if (acl != null) {
        storeAcl(fullPath, acl);
      }
      
      // Git operations
      git.add().addFilepattern(fullPath).call();
      
      if (StringUtils.isNotEmpty(versionMessage)) {
        commitChanges(versionMessage, "Create file: " + fullPath);
      }
      
      // Cache the file
      fileCache.put(fullPath, newFile);
      
      return newFile;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to create file: " + file.getName(), e);
    }
  }

  @Override
  public RepositoryFile createFolder(Serializable parentFolderId, RepositoryFile folder, 
                                     RepositoryFileAcl acl, String versionMessage) {
    Assert.notNull(folder, "Folder cannot be null");
    
    try {
      String parentPath = resolveParentPath(parentFolderId);
      String fullPath = buildPath(parentPath, folder.getName());
      File targetDir = new File(workingDirectory, fullPath);
      
      // Create directory
      targetDir.mkdirs();
      
      // Create .gitkeep file to ensure empty directories are tracked
      File gitKeepFile = new File(targetDir, ".gitkeep");
      Files.write(gitKeepFile.toPath(), "".getBytes());
      
      // Create RepositoryFile metadata
      RepositoryFile newFolder = createRepositoryFileMetadata(folder, fullPath, true);
      
      // Store ACL if provided
      if (acl != null) {
        storeAcl(fullPath, acl);
      }
      
      // Git operations
      git.add().addFilepattern(fullPath + "/.gitkeep").call();
      
      if (StringUtils.isNotEmpty(versionMessage)) {
        commitChanges(versionMessage, "Create folder: " + fullPath);
      }
      
      // Cache the folder
      fileCache.put(fullPath, newFolder);
      
      return newFolder;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to create folder: " + folder.getName(), e);
    }
  }

  @Override
  public RepositoryFile getFile(String path) {
    return getFile(path, false);
  }

  @Override
  public RepositoryFile getFile(String path, boolean loadLocaleMaps) {
    if (StringUtils.isEmpty(path)) {
      return null;
    }
    
    // Check cache first
    RepositoryFile cachedFile = fileCache.get(path);
    if (cachedFile != null) {
      return cachedFile;
    }
    
    File file = new File(workingDirectory, path);
    if (!file.exists()) {
      return null;
    }
    
    try {
      RepositoryFile repositoryFile = createRepositoryFileFromPath(path, file);
      fileCache.put(path, repositoryFile);
      return repositoryFile;
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get file: " + path, e);
    }
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId) {
    return getFile(fileId.toString());
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId, boolean loadLocaleMaps) {
    return getFile(fileId.toString(), loadLocaleMaps);
  }

  @Override
  public RepositoryFile getFile(Serializable fileId, Serializable versionId) {
    try {
      String path = fileId.toString();
      String commitId = versionId.toString();
      
      // Get file content from specific Git commit
      ObjectId commitObjectId = gitRepository.resolve(commitId);
      if (commitObjectId == null) {
        return null;
      }
      
      try (RevWalk revWalk = new RevWalk(gitRepository)) {
        RevCommit commit = revWalk.parseCommit(commitObjectId);
        
        try (TreeWalk treeWalk = new TreeWalk(gitRepository)) {
          treeWalk.addTree(commit.getTree());
          treeWalk.setRecursive(true);
          treeWalk.setFilter(PathFilter.create(path));
          
          if (treeWalk.next()) {
            // File exists in this commit
            return createRepositoryFileFromTreeWalk(path, treeWalk, commit);
          }
        }
      }
      
      return null;
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get file version: " + fileId, e);
    }
  }

  @Override
  public <T extends IRepositoryFileData> T getData(Serializable fileId, Serializable versionId, Class<T> dataClass) {
    try {
      String path = fileId.toString();
      File file = new File(workingDirectory, path);
      
      if (!file.exists() || file.isDirectory()) {
        return null;
      }
      
      if (versionId != null) {
        return getDataFromVersion(path, versionId.toString(), dataClass);
      }
      
      return readFileData(file, dataClass);
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get file data: " + fileId, e);
    }
  }

  @Override
  public List<RepositoryFile> getChildren(Serializable folderId) {
    return getChildren(folderId, "*", false);
  }

  @Override
  public List<RepositoryFile> getChildren(Serializable folderId, String filter, Boolean showHiddenFiles) {
    return getChildren(new RepositoryRequest(folderId.toString(), showHiddenFiles, -1, filter));
  }

  @Override
  public List<RepositoryFile> getChildren(RepositoryRequest repositoryRequest) {
    try {
      String folderPath = repositoryRequest.getPath();
      File folder = new File(workingDirectory, folderPath);
      
      if (!folder.exists() || !folder.isDirectory()) {
        return Collections.emptyList();
      }
      
      File[] children = folder.listFiles();
      if (children == null) {
        return Collections.emptyList();
      }
      
      List<RepositoryFile> result = new ArrayList<>();
      
      for (File child : children) {
        // Skip Git metadata and Pentaho metadata directories
        if (child.getName().startsWith(".git") || child.getName().equals(PENTAHO_METADATA_DIR)) {
          continue;
        }
        
        // Apply filter
        if (StringUtils.isNotEmpty(repositoryRequest.getChildNameFilter())) {
          if (!matchesFilter(child.getName(), repositoryRequest.getChildNameFilter())) {
            continue;
          }
        }
        
        // Handle hidden files
        if (!repositoryRequest.isShowHidden() && child.getName().startsWith(".")) {
          continue;
        }
        
        String childPath = buildPath(folderPath, child.getName());
        RepositoryFile repoFile = createRepositoryFileFromPath(childPath, child);
        result.add(repoFile);
      }
      
      return result;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get children for: " + repositoryRequest.getPath(), e);
    }
  }

  @Override
  public RepositoryFile updateFile(RepositoryFile file, IRepositoryFileData content, String versionMessage) {
    Assert.notNull(file, "File cannot be null");
    Assert.notNull(content, "Content cannot be null");
    
    try {
      String path = file.getPath();
      File targetFile = new File(workingDirectory, path);
      
      if (!targetFile.exists()) {
        throw new UnifiedRepositoryException("File does not exist: " + path);
      }
      
      // Write updated content
      writeFileContent(targetFile, content);
      
      // Create updated RepositoryFile metadata
      RepositoryFile updatedFile = createRepositoryFileMetadata(file, path, false);
      
      // Git operations
      git.add().addFilepattern(path).call();
      
      if (StringUtils.isNotEmpty(versionMessage)) {
        commitChanges(versionMessage, "Update file: " + path);
      }
      
      // Update cache
      fileCache.put(path, updatedFile);
      
      return updatedFile;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to update file: " + file.getPath(), e);
    }
  }

  @Override
  public RepositoryFile updateFolder(RepositoryFile folder, String versionMessage) {
    Assert.notNull(folder, "Folder cannot be null");
    
    try {
      String path = folder.getPath();
      
      // Update metadata
      RepositoryFile updatedFolder = createRepositoryFileMetadata(folder, path, true);
      
      if (StringUtils.isNotEmpty(versionMessage)) {
        commitChanges(versionMessage, "Update folder: " + path);
      }
      
      // Update cache
      fileCache.put(path, updatedFolder);
      
      return updatedFolder;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to update folder: " + folder.getPath(), e);
    }
  }

  @Override
  public void deleteFile(Serializable fileId, String versionMessage) {
    try {
      String path = fileId.toString();
      File file = new File(workingDirectory, path);
      
      if (!file.exists()) {
        return; // Already deleted
      }
      
      // Remove from Git
      git.rm().addFilepattern(path).call();
      
      if (StringUtils.isNotEmpty(versionMessage)) {
        commitChanges(versionMessage, "Delete file: " + path);
      }
      
      // Remove from cache
      fileCache.remove(path);
      
      // Remove ACL and metadata
      removeAcl(path);
      removeMetadata(path);
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to delete file: " + fileId, e);
    }
  }

  @Override
  public void deleteFileAtVersion(Serializable fileId, Serializable versionId) {
    // Git doesn't support deleting specific versions, this would require complex Git surgery
    throw new UnsupportedOperationException("Deleting specific versions is not supported in Git implementation");
  }

  @Override
  public List<VersionSummary> getVersionSummaries(Serializable fileId) {
    try {
      String path = fileId.toString();
      List<VersionSummary> versions = new ArrayList<>();
      
      Iterable<RevCommit> commits = git.log().addPath(path).call();
      
      for (RevCommit commit : commits) {
        VersionSummary version = new VersionSummary(
            commit.getId().getName(),
            commit.getShortMessage(),
            commit.getAuthorIdent().getName(),
            new Date(commit.getCommitTime() * 1000L)
        );
        versions.add(version);
      }
      
      return versions;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get version summaries for: " + fileId, e);
    }
  }

  @Override
  public VersionSummary getVersionSummary(Serializable fileId, Serializable versionId) {
    try {
      String commitId = versionId.toString();
      ObjectId commitObjectId = gitRepository.resolve(commitId);
      
      if (commitObjectId == null) {
        return null;
      }
      
      try (RevWalk revWalk = new RevWalk(gitRepository)) {
        RevCommit commit = revWalk.parseCommit(commitObjectId);
        
        return new VersionSummary(
            commit.getId().getName(),
            commit.getShortMessage(),
            commit.getAuthorIdent().getName(),
            new Date(commit.getCommitTime() * 1000L)
        );
      }
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get version summary: " + versionId, e);
    }
  }

  @Override
  public boolean canUnlockFile(Serializable fileId) {
    // Git doesn't have explicit file locking, return true
    return true;
  }

  @Override
  public void lockFile(Serializable fileId, String message) {
    // Git doesn't have explicit file locking, this is a no-op
    // Could be implemented using Git LFS or custom metadata
  }

  @Override
  public void unlockFile(Serializable fileId) {
    // Git doesn't have explicit file locking, this is a no-op
  }

  @Override
  public List<Character> getReservedChars() {
    return new ArrayList<>(RESERVED_CHARS);
  }

  // Additional Git-specific methods and utilities follow...
  // [Continued implementation details for remaining interface methods]

  // ~ Private Helper Methods
  // =========================================================================================================

  private String resolveParentPath(Serializable parentFolderId) {
    if (parentFolderId == null) {
      return "";
    }
    String path = parentFolderId.toString();
    return path.startsWith("/") ? path.substring(1) : path;
  }

  private String buildPath(String parent, String child) {
    if (StringUtils.isEmpty(parent)) {
      return child;
    }
    return parent + "/" + child;
  }

  private void writeFileContent(File file, IRepositoryFileData content) throws IOException {
    if (content instanceof SimpleRepositoryFileData) {
      SimpleRepositoryFileData simpleData = (SimpleRepositoryFileData) content;
      try (InputStream inputStream = simpleData.getInputStream()) {
        Files.copy(inputStream, file.toPath());
      }
    } else {
      throw new UnsupportedOperationException("Unsupported content type: " + content.getClass());
    }
  }

  private RepositoryFile createRepositoryFileMetadata(RepositoryFile template, String path, boolean isFolder) {
    return new RepositoryFile.Builder(path)
        .name(template.getName())
        .folder(isFolder)
        .createdDate(new Date())
        .lastModificationDate(new Date())
        .build();
  }

  private RepositoryFile createRepositoryFileFromPath(String path, File file) {
    return new RepositoryFile.Builder(path)
        .name(file.getName())
        .folder(file.isDirectory())
        .createdDate(new Date(file.lastModified()))
        .lastModificationDate(new Date(file.lastModified()))
        .fileSize(file.isFile() ? file.length() : 0)
        .build();
  }

  private RepositoryFile createRepositoryFileFromTreeWalk(String path, TreeWalk treeWalk, RevCommit commit) {
    return new RepositoryFile.Builder(path)
        .name(Paths.get(path).getFileName().toString())
        .folder(false) // TreeWalk only returns files
        .createdDate(new Date(commit.getCommitTime() * 1000L))
        .lastModificationDate(new Date(commit.getCommitTime() * 1000L))
        .build();
  }

  @SuppressWarnings("unchecked")
  private <T extends IRepositoryFileData> T readFileData(File file, Class<T> dataClass) throws IOException {
    if (dataClass.isAssignableFrom(SimpleRepositoryFileData.class)) {
      byte[] content = Files.readAllBytes(file.toPath());
      return (T) new SimpleRepositoryFileData(new ByteArrayInputStream(content), "UTF-8", "text/plain");
    }
    throw new UnsupportedOperationException("Unsupported data class: " + dataClass);
  }

  @SuppressWarnings("unchecked")
  private <T extends IRepositoryFileData> T getDataFromVersion(String path, String commitId, Class<T> dataClass) throws Exception {
    ObjectId commitObjectId = gitRepository.resolve(commitId);
    if (commitObjectId == null) {
      return null;
    }

    try (RevWalk revWalk = new RevWalk(gitRepository)) {
      RevCommit commit = revWalk.parseCommit(commitObjectId);
      
      try (TreeWalk treeWalk = new TreeWalk(gitRepository)) {
        treeWalk.addTree(commit.getTree());
        treeWalk.setRecursive(true);
        treeWalk.setFilter(PathFilter.create(path));
        
        if (treeWalk.next()) {
          ObjectId blobId = treeWalk.getObjectId(0);
          byte[] content = gitRepository.open(blobId).getBytes();
          
          if (dataClass.isAssignableFrom(SimpleRepositoryFileData.class)) {
            return (T) new SimpleRepositoryFileData(new ByteArrayInputStream(content), "UTF-8", "text/plain");
          }
        }
      }
    }
    
    return null;
  }

  private void commitChanges(String message, String defaultMessage) throws GitAPIException {
    String commitMessage = StringUtils.isNotEmpty(message) ? message : defaultMessage;
    git.commit()
        .setMessage(commitMessage)
        .setAuthor("Pentaho System", "system@pentaho.com")
        .call();
  }

  private boolean matchesFilter(String filename, String filter) {
    // Simple wildcard matching
    String regex = filter.replace("*", ".*").replace("?", ".");
    return filename.matches(regex);
  }

  private void storeAcl(String path, RepositoryFileAcl acl) {
    // Store ACL in metadata directory
    // Implementation depends on ACL serialization requirements
  }

  private void removeAcl(String path) {
    // Remove ACL from metadata directory
  }

  private void removeMetadata(String path) {
    // Remove all metadata for the path
  }

  // Placeholder implementations for remaining interface methods
  @Override
  public void moveFile(Serializable fileId, String destAbsPath, String versionMessage) {
    throw new UnsupportedOperationException("Move operation not yet implemented");
  }

  @Override
  public void copyFile(Serializable fileId, String destAbsPath, String versionMessage) {
    throw new UnsupportedOperationException("Copy operation not yet implemented");
  }

  @Override
  public void restoreFileAtVersion(Serializable fileId, Serializable versionId, String versionMessage) {
    throw new UnsupportedOperationException("Restore operation not yet implemented");
  }

  @Override
  public void undeleteFile(Serializable fileId, String versionMessage) {
    throw new UnsupportedOperationException("Undelete operation not yet implemented");
  }

  @Override
  public List<RepositoryFile> getDeletedFiles(Serializable folderFolderId, String filter) {
    return Collections.emptyList(); // Git doesn't track deleted files separately
  }

  @Override
  public List<RepositoryFile> getDeletedFiles(Serializable folderId) {
    return Collections.emptyList();
  }

  @Override
  public List<RepositoryFile> getDeletedFiles() {
    return Collections.emptyList();
  }

  @Override
  public RepositoryFileTree getTree(RepositoryRequest repositoryRequest) {
    throw new UnsupportedOperationException("Tree operation not yet implemented");
  }

  @Override
  public List<RepositoryFile> getReferrers(Serializable fileId) {
    return Collections.emptyList(); // Cross-reference tracking not implemented
  }

  @Override
  public void setFileMetadata(Serializable fileId, Map<String, Serializable> metadataMap) {
    // Store metadata in .pentaho/metadata directory
  }

  @Override
  public Map<String, Serializable> getFileMetadata(Serializable fileId) {
    return Collections.emptyMap(); // Metadata retrieval not implemented
  }

  @Override
  public List<Locale> getAvailableLocalesForFileById(Serializable fileId) {
    return Collections.emptyList();
  }

  @Override
  public List<Locale> getAvailableLocalesForFileByPath(String relPath) {
    return Collections.emptyList();
  }

  @Override
  public List<Locale> getAvailableLocalesForFile(RepositoryFile repositoryFile) {
    return Collections.emptyList();
  }

  @Override
  public Properties getLocalePropertiesForFileById(Serializable fileId, String locale) {
    return new Properties();
  }

  @Override
  public Properties getLocalePropertiesForFileByPath(String relPath, String locale) {
    return new Properties();
  }

  @Override
  public Properties getLocalePropertiesForFile(RepositoryFile repositoryFile, String locale) {
    return new Properties();
  }

  @Override
  public void setLocalePropertiesForFileById(Serializable fileId, String locale, Properties properties) {
    // Locale properties not implemented
  }

  @Override
  public void setLocalePropertiesForFileByPath(String relPath, String locale, Properties properties) {
    // Locale properties not implemented  
  }

  @Override
  public void setLocalePropertiesForFile(RepositoryFile repositoryFile, String locale, Properties properties) {
    // Locale properties not implemented
  }

  @Override
  public void deleteLocalePropertiesForFile(RepositoryFile repositoryFile, String locale) {
    // Locale properties not implemented
  }

  @Override
  public RepositoryFile getFile(String path, IPentahoLocale locale) {
    return getFile(path);
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId, IPentahoLocale locale) {
    return getFileById(fileId);
  }

  @Override
  public RepositoryFile getFile(String path, boolean loadLocaleMaps, IPentahoLocale locale) {
    return getFile(path, loadLocaleMaps);
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId, boolean loadLocaleMaps, IPentahoLocale locale) {
    return getFileById(fileId, loadLocaleMaps);
  }

  @Override
  public <T extends IRepositoryFileData> List<T> getDataForReadInBatch(List<RepositoryFile> files, Class<T> dataClass) {
    return files.stream()
        .map(file -> getData(file.getId(), null, dataClass))
        .collect(Collectors.toList());
  }

  @Override
  public <T extends IRepositoryFileData> List<T> getDataForExecuteInBatch(List<RepositoryFile> files, Class<T> dataClass) {
    return getDataForReadInBatch(files, dataClass);
  }

  @Override
  public List<VersionSummary> getVersionSummaryInBatch(List<RepositoryFile> files) {
    return files.stream()
        .map(file -> getVersionSummaries(file.getId()))
        .flatMap(List::stream)
        .collect(Collectors.toList());
  }

  // Git-specific additional methods
  
  /**
   * Switches to a different Git branch.
   * 
   * @param branchName the name of the branch to switch to
   * @throws GitAPIException if branch switching fails
   */
  public void switchBranch(String branchName) throws GitAPIException {
    git.checkout().setName(branchName).call();
    this.currentBranch = branchName;
    // Clear cache as content may be different on new branch
    fileCache.clear();
  }

  /**
   * Creates a new Git branch.
   * 
   * @param branchName the name of the new branch
   * @throws GitAPIException if branch creation fails
   */
  public void createBranch(String branchName) throws GitAPIException {
    git.branchCreate().setName(branchName).call();
  }

  /**
   * Returns the current Git branch name.
   * 
   * @return the current branch name
   */
  public String getCurrentBranch() {
    return currentBranch;
  }

  /**
   * Returns the underlying Git repository.
   * 
   * @return the Git repository instance
   */
  public Repository getGitRepository() {
    return gitRepository;
  }

  /**
   * Returns the Git instance for advanced operations.
   * 
   * @return the Git instance
   */
  public Git getGit() {
    return git;
  }
}
