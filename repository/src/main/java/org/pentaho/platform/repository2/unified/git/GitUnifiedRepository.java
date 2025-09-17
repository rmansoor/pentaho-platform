package org.pentaho.platform.repository2.unified.git;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.pentaho.platform.api.locale.IPentahoLocale;
import org.pentaho.platform.api.repository2.unified.IRepositoryFileData;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAce;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAcl;
import org.pentaho.platform.api.repository2.unified.RepositoryFilePermission;
import org.pentaho.platform.api.repository2.unified.RepositoryFileTree;
import org.pentaho.platform.api.repository2.unified.RepositoryRequest;
import org.pentaho.platform.api.repository2.unified.UnifiedRepositoryException;
import org.pentaho.platform.api.repository2.unified.VersionSummary;
import org.pentaho.platform.repository2.unified.IRepositoryFileAclDao;
import org.pentaho.platform.repository2.unified.IRepositoryFileDao;
import org.springframework.util.Assert;

import java.io.File;
import java.io.IOException;
import java.io.Serializable;
import java.util.*;

/**
 * Git-based implementation of {@link IUnifiedRepository} that provides
 * distributed version control capabilities for Pentaho repository operations.
 * 
 * This implementation follows the same delegation pattern as {@link DefaultUnifiedRepository}
 * but uses Git as the underlying storage mechanism, providing:
 * 
 * - Full Git version control with commit history
 * - Branch-based development and isolation  
 * - Distributed repository capabilities
 * - Git-native backup and restore through clone/push/pull
 * - Integration with Git tooling and workflows
 * - Human-readable storage format
 * 
 * The implementation delegates to:
 * - {@link GitRepositoryFileDao} for file operations
 * - {@link GitRepositoryFileAclDao} for ACL management
 * 
 * @author Auto-generated Git Implementation
 */
public class GitUnifiedRepository implements IUnifiedRepository {

  // ~ Instance fields
  // =================================================================================================
  
  private final IRepositoryFileDao repositoryFileDao;
  private final IRepositoryFileAclDao repositoryFileAclDao;
  private final GitRepositoryFileDao gitFileDao;
  private final GitRepositoryFileAclDao gitAclDao;

  // ~ Constructors
  // ====================================================================================================

  /**
   * Constructs a new GitUnifiedRepository with the specified Git repository path.
   * 
   * @param repositoryPath the path to the Git repository directory
   * @throws IOException if repository initialization fails
   */
  public GitUnifiedRepository(String repositoryPath) throws IOException {
    this(new File(repositoryPath));
  }

  /**
   * Constructs a new GitUnifiedRepository with the specified Git repository directory.
   * 
   * @param repositoryDir the Git repository directory
   * @throws IOException if repository initialization fails
   */
  public GitUnifiedRepository(File repositoryDir) throws IOException {
    Assert.notNull(repositoryDir, "Repository directory cannot be null");
    
    // Initialize Git-based DAOs
    this.gitFileDao = new GitRepositoryFileDao(repositoryDir);
    this.gitAclDao = new GitRepositoryFileAclDao(repositoryDir, gitFileDao.getGit());
    
    // Assign to interface references for delegation
    this.repositoryFileDao = gitFileDao;
    this.repositoryFileAclDao = gitAclDao;
  }

  /**
   * Constructs a new GitUnifiedRepository with provided DAO instances.
   * 
   * @param contentDao the file DAO implementation
   * @param aclDao the ACL DAO implementation
   */
  public GitUnifiedRepository(final IRepositoryFileDao contentDao, final IRepositoryFileAclDao aclDao) {
    super();
    Assert.notNull(contentDao, "Content DAO cannot be null");
    Assert.notNull(aclDao, "ACL DAO cannot be null");
    
    this.repositoryFileDao = contentDao;
    this.repositoryFileAclDao = aclDao;
    
    // Try to cast to Git implementations for additional features
    this.gitFileDao = (contentDao instanceof GitRepositoryFileDao) ? (GitRepositoryFileDao) contentDao : null;
    this.gitAclDao = (aclDao instanceof GitRepositoryFileAclDao) ? (GitRepositoryFileAclDao) aclDao : null;
  }

  // ~ IUnifiedRepository Implementation
  // =========================================================================================================
  // Following the same delegation pattern as DefaultUnifiedRepository

  @Override
  public RepositoryFile createFile(Serializable parentFolderId, RepositoryFile file, 
                                   IRepositoryFileData data, String versionMessage) {
    return repositoryFileDao.createFile(parentFolderId, file, data, null, versionMessage);
  }

  @Override
  public RepositoryFile createFile(Serializable parentFolderId, RepositoryFile file, 
                                   IRepositoryFileData data, RepositoryFileAcl acl, String versionMessage) {
    return repositoryFileDao.createFile(parentFolderId, file, data, acl, versionMessage);
  }

  @Override
  public RepositoryFile createFolder(Serializable parentFolderId, RepositoryFile folder, String versionMessage) {
    return repositoryFileDao.createFolder(parentFolderId, folder, null, versionMessage);
  }

  @Override
  public RepositoryFile createFolder(Serializable parentFolderId, RepositoryFile folder, 
                                     RepositoryFileAcl acl, String versionMessage) {
    return repositoryFileDao.createFolder(parentFolderId, folder, acl, versionMessage);
  }

  @Override
  public List<RepositoryFile> getChildren(Serializable folderId) {
    Assert.notNull(folderId, "Folder ID cannot be null");
    return repositoryFileDao.getChildren(folderId);
  }

  @Override
  public List<RepositoryFile> getChildren(Serializable folderId, String filter) {
    Assert.notNull(folderId, "Folder ID cannot be null");
    return repositoryFileDao.getChildren(folderId, filter, false);
  }

  @Override
  public List<RepositoryFile> getChildren(Serializable folderId, String filter, Boolean showHiddenFiles) {
    Assert.notNull(folderId, "Folder ID cannot be null");
    return repositoryFileDao.getChildren(folderId, filter, showHiddenFiles);
  }

  @Override
  public List<RepositoryFile> getChildren(RepositoryRequest repositoryRequest) {
    Assert.notNull(repositoryRequest, "Repository request cannot be null");
    return repositoryFileDao.getChildren(repositoryRequest);
  }

  @Override
  public <T extends IRepositoryFileData> T getDataForRead(Serializable fileId, Class<T> dataClass) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getData(fileId, null, dataClass);
  }

  @Override
  public <T extends IRepositoryFileData> T getDataForExecute(Serializable fileId, Class<T> dataClass) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getData(fileId, null, dataClass);
  }

  @Override
  public <T extends IRepositoryFileData> T getDataAtVersionForRead(Serializable fileId, Serializable versionId, Class<T> dataClass) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(versionId, "Version ID cannot be null");
    return repositoryFileDao.getData(fileId, versionId, dataClass);
  }

  @Override
  public <T extends IRepositoryFileData> T getDataAtVersionForExecute(Serializable fileId, Serializable versionId, Class<T> dataClass) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(versionId, "Version ID cannot be null");
    return repositoryFileDao.getData(fileId, versionId, dataClass);
  }

  @Override
  public RepositoryFile getFile(String path) {
    Assert.hasText(path, "Path cannot be null or empty");
    return repositoryFileDao.getFile(path);
  }

  @Override
  public RepositoryFile getFile(String path, boolean loadLocaleMaps) {
    Assert.hasText(path, "Path cannot be null or empty");
    return repositoryFileDao.getFile(path, loadLocaleMaps);
  }

  @Override
  public RepositoryFile getFile(String path, IPentahoLocale locale) {
    Assert.hasText(path, "Path cannot be null or empty");
    return repositoryFileDao.getFile(path, locale);
  }

  @Override
  public RepositoryFile getFile(String path, boolean loadLocaleMaps, IPentahoLocale locale) {
    Assert.hasText(path, "Path cannot be null or empty");
    return repositoryFileDao.getFile(path, loadLocaleMaps, locale);
  }

  @Override
  public RepositoryFile getFileAtVersion(Serializable fileId, Serializable versionId) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(versionId, "Version ID cannot be null");
    return repositoryFileDao.getFile(fileId, versionId);
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getFileById(fileId);
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId, boolean loadLocaleMaps) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getFileById(fileId, loadLocaleMaps);
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId, IPentahoLocale locale) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getFileById(fileId, locale);
  }

  @Override
  public RepositoryFile getFileById(Serializable fileId, boolean loadLocaleMaps, IPentahoLocale locale) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getFileById(fileId, loadLocaleMaps, locale);
  }

  @Override
  public RepositoryFileTree getTree(String path, int depth, String filter, boolean showHidden) {
    Assert.hasText(path, "Path cannot be null or empty");
    RepositoryRequest request = new RepositoryRequest(path, showHidden, depth, filter);
    return repositoryFileDao.getTree(request);
  }

  @Override
  public RepositoryFileTree getTree(RepositoryRequest repositoryRequest) {
    Assert.notNull(repositoryRequest, "Repository request cannot be null");
    return repositoryFileDao.getTree(repositoryRequest);
  }

  @Override
  public RepositoryFile updateFile(RepositoryFile file, IRepositoryFileData data, String versionMessage) {
    Assert.notNull(file, "File cannot be null");
    Assert.notNull(data, "Data cannot be null");
    return repositoryFileDao.updateFile(file, data, versionMessage);
  }

  @Override
  public void deleteFile(Serializable fileId, String versionMessage) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.deleteFile(fileId, versionMessage);
  }

  @Override
  public void deleteFile(Serializable fileId, boolean permanent, String versionMessage) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.deleteFile(fileId, versionMessage);
  }

  @Override
  public void deleteFileAtVersion(Serializable fileId, Serializable versionId) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(versionId, "Version ID cannot be null");
    repositoryFileDao.deleteFileAtVersion(fileId, versionId);
  }

  @Override
  public void undeleteFile(Serializable fileId, String versionMessage) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.undeleteFile(fileId, versionMessage);
  }

  @Override
  public List<RepositoryFile> getDeletedFiles(Serializable folderFolderId, String filter) {
    return repositoryFileDao.getDeletedFiles(folderFolderId, filter);
  }

  @Override
  public List<RepositoryFile> getDeletedFiles(Serializable folderId) {
    return repositoryFileDao.getDeletedFiles(folderId);
  }

  @Override
  public List<RepositoryFile> getDeletedFiles() {
    return repositoryFileDao.getDeletedFiles();
  }

  @Override
  public boolean canUnlockFile(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.canUnlockFile(fileId);
  }

  @Override
  public void lockFile(Serializable fileId, String message) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.lockFile(fileId, message);
  }

  @Override
  public void unlockFile(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.unlockFile(fileId);
  }

  @Override
  public List<VersionSummary> getVersionSummaries(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getVersionSummaries(fileId);
  }

  @Override
  public VersionSummary getVersionSummary(Serializable fileId, Serializable versionId) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(versionId, "Version ID cannot be null");
    return repositoryFileDao.getVersionSummary(fileId, versionId);
  }

  @Override
  public void restoreFileAtVersion(Serializable fileId, Serializable versionId, String versionMessage) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(versionId, "Version ID cannot be null");
    repositoryFileDao.restoreFileAtVersion(fileId, versionId, versionMessage);
  }

  @Override
  public void moveFile(Serializable fileId, String destAbsPath, String versionMessage) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.hasText(destAbsPath, "Destination path cannot be null or empty");
    repositoryFileDao.moveFile(fileId, destAbsPath, versionMessage);
  }

  @Override
  public void copyFile(Serializable fileId, String destAbsPath, String versionMessage) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.hasText(destAbsPath, "Destination path cannot be null or empty");
    repositoryFileDao.copyFile(fileId, destAbsPath, versionMessage);
  }

  // ~ ACL-related methods delegating to ACL DAO
  // =========================================================================================================

  @Override
  public RepositoryFileAcl getAcl(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileAclDao.getAcl(fileId);
  }

  @Override
  public RepositoryFileAcl updateAcl(RepositoryFileAcl acl) {
    Assert.notNull(acl, "ACL cannot be null");
    return repositoryFileAclDao.updateAcl(acl);
  }

  @Override
  public List<RepositoryFileAce> getEffectiveAces(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileAclDao.getEffectiveAces(fileId);
  }

  @Override
  public List<RepositoryFileAce> getEffectiveAces(Serializable fileId, boolean forceEntriesInheriting) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileAclDao.getEffectiveAces(fileId, forceEntriesInheriting);
  }

  @Override
  public boolean hasAccess(String path, EnumSet<RepositoryFilePermission> permissions) {
    Assert.hasText(path, "Path cannot be null or empty");
    Assert.notNull(permissions, "Permissions cannot be null");
    // Implementation would need current user context
    throw new UnsupportedOperationException("hasAccess requires user context - use hasAccess with RepositoryFileSid");
  }

  // ~ Additional delegated methods
  // =========================================================================================================

  @Override
  public List<RepositoryFile> getReferrers(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getReferrers(fileId);
  }

  @Override
  public void setFileMetadata(Serializable fileId, Map<String, Serializable> metadataMap) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.setFileMetadata(fileId, metadataMap);
  }

  @Override
  public Map<String, Serializable> getFileMetadata(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getFileMetadata(fileId);
  }

  @Override
  public List<Character> getReservedChars() {
    return repositoryFileDao.getReservedChars();
  }

  @Override
  public <T extends IRepositoryFileData> List<T> getDataForReadInBatch(List<RepositoryFile> files, Class<T> dataClass) {
    Assert.notNull(files, "Files list cannot be null");
    return repositoryFileDao.getDataForReadInBatch(files, dataClass);
  }

  @Override
  public <T extends IRepositoryFileData> List<T> getDataForExecuteInBatch(List<RepositoryFile> files, Class<T> dataClass) {
    Assert.notNull(files, "Files list cannot be null");
    return repositoryFileDao.getDataForExecuteInBatch(files, dataClass);
  }

  @Override
  public List<VersionSummary> getVersionSummaryInBatch(List<RepositoryFile> files) {
    Assert.notNull(files, "Files list cannot be null");
    return repositoryFileDao.getVersionSummaryInBatch(files);
  }

  // ~ Locale-related methods
  // =========================================================================================================

  @Override
  public List<Locale> getAvailableLocalesForFileById(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getAvailableLocalesForFileById(fileId);
  }

  @Override
  public List<Locale> getAvailableLocalesForFileByPath(String relPath) {
    Assert.hasText(relPath, "Path cannot be null or empty");
    return repositoryFileDao.getAvailableLocalesForFileByPath(relPath);
  }

  @Override
  public List<Locale> getAvailableLocalesForFile(RepositoryFile repositoryFile) {
    Assert.notNull(repositoryFile, "Repository file cannot be null");
    return repositoryFileDao.getAvailableLocalesForFile(repositoryFile);
  }

  @Override
  public Properties getLocalePropertiesForFileById(Serializable fileId, String locale) {
    Assert.notNull(fileId, "File ID cannot be null");
    return repositoryFileDao.getLocalePropertiesForFileById(fileId, locale);
  }

  @Override
  public Properties getLocalePropertiesForFileByPath(String relPath, String locale) {
    Assert.hasText(relPath, "Path cannot be null or empty");
    return repositoryFileDao.getLocalePropertiesForFileByPath(relPath, locale);
  }

  @Override
  public Properties getLocalePropertiesForFile(RepositoryFile repositoryFile, String locale) {
    Assert.notNull(repositoryFile, "Repository file cannot be null");
    return repositoryFileDao.getLocalePropertiesForFile(repositoryFile, locale);
  }

  @Override
  public void setLocalePropertiesForFileById(Serializable fileId, String locale, Properties properties) {
    Assert.notNull(fileId, "File ID cannot be null");
    repositoryFileDao.setLocalePropertiesForFileById(fileId, locale, properties);
  }

  @Override
  public void setLocalePropertiesForFileByPath(String relPath, String locale, Properties properties) {
    Assert.hasText(relPath, "Path cannot be null or empty");
    repositoryFileDao.setLocalePropertiesForFileByPath(relPath, locale, properties);
  }

  @Override
  public void setLocalePropertiesForFile(RepositoryFile repositoryFile, String locale, Properties properties) {
    Assert.notNull(repositoryFile, "Repository file cannot be null");
    repositoryFileDao.setLocalePropertiesForFile(repositoryFile, locale, properties);
  }

  @Override
  public void deleteLocalePropertiesForFile(RepositoryFile repositoryFile, String locale) {
    Assert.notNull(repositoryFile, "Repository file cannot be null");
    repositoryFileDao.deleteLocalePropertiesForFile(repositoryFile, locale);
  }

  // ~ Git-specific methods (available when using Git implementations)
  // =========================================================================================================

  /**
   * Switches to a different Git branch. This operation affects the entire repository view.
   * 
   * @param branchName the name of the branch to switch to
   * @throws GitAPIException if branch switching fails
   * @throws UnsupportedOperationException if not using Git implementation
   */
  public void switchBranch(String branchName) throws GitAPIException {
    if (gitFileDao == null) {
      throw new UnsupportedOperationException("Branch operations require GitRepositoryFileDao");
    }
    
    gitFileDao.switchBranch(branchName);
    
    // Clear ACL cache as well since content may be different on new branch
    if (gitAclDao != null) {
      gitAclDao.clearCache();
    }
  }

  /**
   * Creates a new Git branch from the current branch.
   * 
   * @param branchName the name of the new branch
   * @throws GitAPIException if branch creation fails
   * @throws UnsupportedOperationException if not using Git implementation
   */
  public void createBranch(String branchName) throws GitAPIException {
    if (gitFileDao == null) {
      throw new UnsupportedOperationException("Branch operations require GitRepositoryFileDao");
    }
    
    gitFileDao.createBranch(branchName);
  }

  /**
   * Returns the current Git branch name.
   * 
   * @return the current branch name
   * @throws UnsupportedOperationException if not using Git implementation
   */
  public String getCurrentBranch() {
    if (gitFileDao == null) {
      throw new UnsupportedOperationException("Branch operations require GitRepositoryFileDao");
    }
    
    return gitFileDao.getCurrentBranch();
  }

  /**
   * Returns the underlying Git instance for advanced operations.
   * 
   * @return the Git instance
   * @throws UnsupportedOperationException if not using Git implementation
   */
  public Git getGit() {
    if (gitFileDao == null) {
      throw new UnsupportedOperationException("Git operations require GitRepositoryFileDao");
    }
    
    return gitFileDao.getGit();
  }

  /**
   * Validates the repository integrity, including ACLs and file consistency.
   * 
   * @return list of validation errors, empty if no issues found
   */
  public List<String> validateRepository() {
    List<String> errors = new ArrayList<>();
    
    // Validate ACLs if using Git ACL DAO
    if (gitAclDao != null) {
      errors.addAll(gitAclDao.validateAcls());
    }
    
    // Add other validation logic as needed
    
    return errors;
  }

  /**
   * Exports repository metadata for reporting and analysis.
   * 
   * @return map containing repository information
   */
  public Map<String, Object> exportRepositoryInfo() {
    Map<String, Object> info = new HashMap<>();
    
    if (gitFileDao != null) {
      info.put("currentBranch", gitFileDao.getCurrentBranch());
      info.put("repositoryType", "Git");
    }
    
    if (gitAclDao != null) {
      info.put("aclSummary", gitAclDao.exportAclSummary());
    }
    
    info.put("implementationType", "GitUnifiedRepository");
    info.put("timestamp", new Date());
    
    return info;
  }

  // ~ Getter methods for DAO access
  // =========================================================================================================

  /**
   * Returns the file DAO instance.
   * 
   * @return the file DAO
   */
  public IRepositoryFileDao getRepositoryFileDao() {
    return repositoryFileDao;
  }

  /**
   * Returns the ACL DAO instance.
   * 
   * @return the ACL DAO
   */
  public IRepositoryFileAclDao getRepositoryFileAclDao() {
    return repositoryFileAclDao;
  }

  /**
   * Returns the Git file DAO instance if available.
   * 
   * @return the Git file DAO, or null if not using Git implementation
   */
  public GitRepositoryFileDao getGitFileDao() {
    return gitFileDao;
  }

  /**
   * Returns the Git ACL DAO instance if available.
   * 
   * @return the Git ACL DAO, or null if not using Git implementation
   */
  public GitRepositoryFileAclDao getGitAclDao() {
    return gitAclDao;
  }
}
