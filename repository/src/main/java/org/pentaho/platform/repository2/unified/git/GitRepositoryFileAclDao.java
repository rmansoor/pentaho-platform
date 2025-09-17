package org.pentaho.platform.repository2.unified.git;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAce;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAcl;
import org.pentaho.platform.api.repository2.unified.RepositoryFileSid;
import org.pentaho.platform.api.repository2.unified.UnifiedRepositoryException;
import org.pentaho.platform.repository2.unified.IRepositoryFileAclDao;
import org.springframework.util.Assert;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;
import java.io.Serializable;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Git-based implementation of {@link IRepositoryFileAclDao} that stores
 * Access Control Lists (ACLs) as JSON files in the Git repository.
 * 
 * This implementation provides:
 * - Git-versioned ACL storage
 * - JSON-based ACL serialization for human readability
 * - Efficient caching of ACL data
 * - Integration with Git branching and merging
 * 
 * ACLs are stored in the .pentaho/acls directory structure within the Git repository,
 * with each file's ACL stored as a corresponding .acl file.
 * 
 * @author Auto-generated Git Implementation
 */
public class GitRepositoryFileAclDao implements IRepositoryFileAclDao {

  // ~ Static fields/initializers
  // ======================================================================================
  
  private static final String ACL_DIR = ".pentaho/acls";
  private static final String ACL_EXTENSION = ".acl";
  
  // ~ Instance fields
  // =================================================================================================
  
  private final File workingDirectory;
  private final Git git;
  private final File aclDirectory;
  private final ObjectMapper objectMapper;
  private final Map<String, RepositoryFileAcl> aclCache = new ConcurrentHashMap<>();

  // ~ Constructors
  // ====================================================================================================

  /**
   * Constructs a new GitRepositoryFileAclDao with the specified Git repository.
   * 
   * @param workingDirectory the Git repository working directory
   * @param git the Git instance for version control operations
   * @throws IOException if ACL directory initialization fails
   */
  public GitRepositoryFileAclDao(File workingDirectory, Git git) throws IOException {
    Assert.notNull(workingDirectory, "Working directory cannot be null");
    Assert.notNull(git, "Git instance cannot be null");
    
    this.workingDirectory = workingDirectory;
    this.git = git;
    this.objectMapper = new ObjectMapper();
    this.aclDirectory = new File(workingDirectory, ACL_DIR);
    
    // Ensure ACL directory exists
    if (!aclDirectory.exists()) {
      aclDirectory.mkdirs();
    }
  }

  // ~ Methods
  // =========================================================================================================

  @Override
  public RepositoryFileAcl createAcl(Serializable fileId, RepositoryFileAcl acl) {
    Assert.notNull(fileId, "File ID cannot be null");
    Assert.notNull(acl, "ACL cannot be null");
    
    try {
      String aclPath = getAclPath(fileId.toString());
      File aclFile = new File(workingDirectory, aclPath);
      
      // Ensure parent directories exist
      aclFile.getParentFile().mkdirs();
      
      // Create ACL with proper ID
      RepositoryFileAcl newAcl = new RepositoryFileAcl.Builder(acl)
          .id(fileId)
          .build();
      
      // Serialize and write ACL
      writeAcl(aclFile, newAcl);
      
      // Git operations
      git.add().addFilepattern(aclPath).call();
      git.commit()
          .setMessage("Create ACL for: " + fileId)
          .setAuthor("Pentaho System", "system@pentaho.com")
          .call();
      
      // Cache the ACL
      aclCache.put(fileId.toString(), newAcl);
      
      return newAcl;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to create ACL for file: " + fileId, e);
    }
  }

  @Override
  public RepositoryFileAcl getAcl(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    
    String fileIdStr = fileId.toString();
    
    // Check cache first
    RepositoryFileAcl cachedAcl = aclCache.get(fileIdStr);
    if (cachedAcl != null) {
      return cachedAcl;
    }
    
    try {
      String aclPath = getAclPath(fileIdStr);
      File aclFile = new File(workingDirectory, aclPath);
      
      if (!aclFile.exists()) {
        // No explicit ACL found, return default ACL
        return createDefaultAcl(fileId);
      }
      
      RepositoryFileAcl acl = readAcl(aclFile);
      aclCache.put(fileIdStr, acl);
      
      return acl;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to get ACL for file: " + fileId, e);
    }
  }

  @Override
  public RepositoryFileAcl updateAcl(RepositoryFileAcl acl) {
    Assert.notNull(acl, "ACL cannot be null");
    Assert.notNull(acl.getId(), "ACL ID cannot be null");
    
    try {
      Serializable fileId = acl.getId();
      String aclPath = getAclPath(fileId.toString());
      File aclFile = new File(workingDirectory, aclPath);
      
      // Ensure parent directories exist
      aclFile.getParentFile().mkdirs();
      
      // Write updated ACL
      writeAcl(aclFile, acl);
      
      // Git operations
      git.add().addFilepattern(aclPath).call();
      git.commit()
          .setMessage("Update ACL for: " + fileId)
          .setAuthor("Pentaho System", "system@pentaho.com")
          .call();
      
      // Update cache
      aclCache.put(fileId.toString(), acl);
      
      return acl;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to update ACL: " + acl.getId(), e);
    }
  }

  @Override
  public void deleteAcl(Serializable fileId) {
    Assert.notNull(fileId, "File ID cannot be null");
    
    try {
      String aclPath = getAclPath(fileId.toString());
      File aclFile = new File(workingDirectory, aclPath);
      
      if (aclFile.exists()) {
        // Remove from Git
        git.rm().addFilepattern(aclPath).call();
        git.commit()
            .setMessage("Delete ACL for: " + fileId)
            .setAuthor("Pentaho System", "system@pentaho.com")
            .call();
      }
      
      // Remove from cache
      aclCache.remove(fileId.toString());
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to delete ACL for file: " + fileId, e);
    }
  }

  @Override
  public List<RepositoryFileAce> getEffectiveAces(Serializable fileId) {
    return getEffectiveAces(fileId, false);
  }

  @Override
  public List<RepositoryFileAce> getEffectiveAces(Serializable fileId, boolean forceEntriesInheriting) {
    RepositoryFileAcl acl = getAcl(fileId);
    if (acl == null) {
      return Collections.emptyList();
    }
    
    List<RepositoryFileAce> effectiveAces = new ArrayList<>(acl.getAces());
    
    // If inheritance is enabled or forced, collect inherited ACEs
    if (acl.isEntriesInheriting() || forceEntriesInheriting) {
      String path = fileId.toString();
      String parentPath = getParentPath(path);
      
      while (parentPath != null && !parentPath.isEmpty()) {
        RepositoryFileAcl parentAcl = getAcl(parentPath);
        if (parentAcl != null) {
          // Add inherited ACEs (those that are inheritable)
          for (RepositoryFileAce ace : parentAcl.getAces()) {
            // In a full implementation, check if ACE is inheritable
            effectiveAces.add(ace);
          }
          
          // Stop if parent doesn't inherit
          if (!parentAcl.isEntriesInheriting()) {
            break;
          }
        }
        
        parentPath = getParentPath(parentPath);
      }
    }
    
    return effectiveAces;
  }

  @Override
  public boolean hasAccess(String relPath, RepositoryFileSid sid, EnumSet<RepositoryFilePermission> permissions) {
    try {
      List<RepositoryFileAce> effectiveAces = getEffectiveAces(relPath);
      
      // Check each ACE for matching SID and permissions
      for (RepositoryFileAce ace : effectiveAces) {
        if (ace.getSid().equals(sid)) {
          // Check if ACE grants all required permissions
          if (ace.getPermissions().containsAll(permissions)) {
            return true;
          }
        }
      }
      
      return false;
      
    } catch (Exception e) {
      throw new UnifiedRepositoryException("Failed to check access for path: " + relPath, e);
    }
  }

  // ~ Private Helper Methods
  // =========================================================================================================

  /**
   * Gets the relative path for storing ACL data for a given file ID.
   * 
   * @param fileId the file identifier
   * @return the ACL storage path
   */
  private String getAclPath(String fileId) {
    // Convert file path to ACL path
    String normalizedPath = fileId.startsWith("/") ? fileId.substring(1) : fileId;
    return ACL_DIR + "/" + normalizedPath + ACL_EXTENSION;
  }

  /**
   * Writes an ACL to the specified file in JSON format.
   * 
   * @param aclFile the file to write to
   * @param acl the ACL to write
   * @throws IOException if writing fails
   */
  private void writeAcl(File aclFile, RepositoryFileAcl acl) throws IOException {
    // Convert ACL to serializable format
    AclDto aclDto = convertToDto(acl);
    
    // Write as formatted JSON
    objectMapper.writerWithDefaultPrettyPrinter()
        .writeValue(aclFile, aclDto);
  }

  /**
   * Reads an ACL from the specified file.
   * 
   * @param aclFile the file to read from
   * @return the ACL read from the file
   * @throws IOException if reading fails
   */
  private RepositoryFileAcl readAcl(File aclFile) throws IOException {
    AclDto aclDto = objectMapper.readValue(aclFile, AclDto.class);
    return convertFromDto(aclDto);
  }

  /**
   * Creates a default ACL for a file when no explicit ACL exists.
   * 
   * @param fileId the file identifier
   * @return a default ACL
   */
  private RepositoryFileAcl createDefaultAcl(Serializable fileId) {
    // Create a default ACL that grants full access to the system
    RepositoryFileSid systemSid = new RepositoryFileSid("system", RepositoryFileSid.Type.USER);
    RepositoryFileAce systemAce = new RepositoryFileAce(
        systemSid,
        EnumSet.allOf(RepositoryFilePermission.class)
    );
    
    return new RepositoryFileAcl.Builder(fileId, systemSid)
        .ace(systemAce)
        .entriesInheriting(true)
        .build();
  }

  /**
   * Gets the parent path of a given path.
   * 
   * @param path the path
   * @return the parent path, or null if no parent
   */
  private String getParentPath(String path) {
    if (path == null || path.isEmpty() || path.equals("/")) {
      return null;
    }
    
    Path p = Paths.get(path);
    Path parent = p.getParent();
    return parent != null ? parent.toString() : null;
  }

  /**
   * Converts a RepositoryFileAcl to a serializable DTO.
   * 
   * @param acl the ACL to convert
   * @return the DTO representation
   */
  private AclDto convertToDto(RepositoryFileAcl acl) {
    AclDto dto = new AclDto();
    dto.id = acl.getId().toString();
    dto.owner = convertSidToDto(acl.getOwner());
    dto.entriesInheriting = acl.isEntriesInheriting();
    
    dto.aces = new ArrayList<>();
    for (RepositoryFileAce ace : acl.getAces()) {
      AceDto aceDto = new AceDto();
      aceDto.sid = convertSidToDto(ace.getSid());
      aceDto.permissions = new ArrayList<>();
      for (RepositoryFilePermission permission : ace.getPermissions()) {
        aceDto.permissions.add(permission.name());
      }
      dto.aces.add(aceDto);
    }
    
    return dto;
  }

  /**
   * Converts a DTO back to a RepositoryFileAcl.
   * 
   * @param dto the DTO to convert
   * @return the ACL
   */
  private RepositoryFileAcl convertFromDto(AclDto dto) {
    RepositoryFileSid owner = convertSidFromDto(dto.owner);
    
    RepositoryFileAcl.Builder builder = new RepositoryFileAcl.Builder(dto.id, owner)
        .entriesInheriting(dto.entriesInheriting);
    
    for (AceDto aceDto : dto.aces) {
      RepositoryFileSid sid = convertSidFromDto(aceDto.sid);
      EnumSet<RepositoryFilePermission> permissions = EnumSet.noneOf(RepositoryFilePermission.class);
      
      for (String permissionName : aceDto.permissions) {
        permissions.add(RepositoryFilePermission.valueOf(permissionName));
      }
      
      RepositoryFileAce ace = new RepositoryFileAce(sid, permissions);
      builder.ace(ace);
    }
    
    return builder.build();
  }

  /**
   * Converts a RepositoryFileSid to a DTO.
   * 
   * @param sid the SID to convert
   * @return the DTO representation
   */
  private SidDto convertSidToDto(RepositoryFileSid sid) {
    SidDto dto = new SidDto();
    dto.name = sid.getName();
    dto.type = sid.getType().name();
    return dto;
  }

  /**
   * Converts a DTO back to a RepositoryFileSid.
   * 
   * @param dto the DTO to convert
   * @return the SID
   */
  private RepositoryFileSid convertSidFromDto(SidDto dto) {
    RepositoryFileSid.Type type = RepositoryFileSid.Type.valueOf(dto.type);
    return new RepositoryFileSid(dto.name, type);
  }

  // ~ Inner Classes for JSON Serialization
  // =========================================================================================================

  /**
   * Data Transfer Object for ACL serialization.
   */
  public static class AclDto {
    public String id;
    public SidDto owner;
    public boolean entriesInheriting;
    public List<AceDto> aces;
  }

  /**
   * Data Transfer Object for ACE serialization.
   */
  public static class AceDto {
    public SidDto sid;
    public List<String> permissions;
  }

  /**
   * Data Transfer Object for SID serialization.
   */
  public static class SidDto {
    public String name;
    public String type;
  }

  // ~ Additional utility methods
  // =========================================================================================================

  /**
   * Clears the ACL cache. Useful when switching Git branches.
   */
  public void clearCache() {
    aclCache.clear();
  }

  /**
   * Gets all ACL file paths in the repository.
   * 
   * @return list of ACL file paths
   * @throws IOException if directory reading fails
   */
  public List<String> getAllAclPaths() throws IOException {
    List<String> aclPaths = new ArrayList<>();
    
    if (aclDirectory.exists()) {
      Files.walk(aclDirectory.toPath())
          .filter(path -> path.toString().endsWith(ACL_EXTENSION))
          .forEach(path -> {
            String relativePath = workingDirectory.toPath().relativize(path).toString();
            aclPaths.add(relativePath);
          });
    }
    
    return aclPaths;
  }

  /**
   * Validates ACL consistency across the repository.
   * 
   * @return list of validation errors
   */
  public List<String> validateAcls() {
    List<String> errors = new ArrayList<>();
    
    try {
      List<String> aclPaths = getAllAclPaths();
      
      for (String aclPath : aclPaths) {
        try {
          File aclFile = new File(workingDirectory, aclPath);
          readAcl(aclFile); // Try to parse ACL
        } catch (Exception e) {
          errors.add("Invalid ACL file: " + aclPath + " - " + e.getMessage());
        }
      }
      
    } catch (Exception e) {
      errors.add("Failed to validate ACLs: " + e.getMessage());
    }
    
    return errors;
  }

  /**
   * Exports all ACLs to a summary format for reporting.
   * 
   * @return map of file paths to ACL summaries
   */
  public Map<String, String> exportAclSummary() {
    Map<String, String> summary = new HashMap<>();
    
    try {
      List<String> aclPaths = getAllAclPaths();
      
      for (String aclPath : aclPaths) {
        try {
          File aclFile = new File(workingDirectory, aclPath);
          RepositoryFileAcl acl = readAcl(aclFile);
          
          StringBuilder sb = new StringBuilder();
          sb.append("Owner: ").append(acl.getOwner().getName())
            .append(" (").append(acl.getOwner().getType()).append(")\n");
          sb.append("Inheriting: ").append(acl.isEntriesInheriting()).append("\n");
          sb.append("ACEs: ").append(acl.getAces().size());
          
          // Remove .acl extension and ACL_DIR prefix to get original file path
          String filePath = aclPath.substring(ACL_DIR.length() + 1, aclPath.length() - ACL_EXTENSION.length());
          summary.put(filePath, sb.toString());
          
        } catch (Exception e) {
          summary.put(aclPath, "Error: " + e.getMessage());
        }
      }
      
    } catch (Exception e) {
      summary.put("ERROR", "Failed to export ACL summary: " + e.getMessage());
    }
    
    return summary;
  }
}

// Missing import statements for RepositoryFilePermission
enum RepositoryFilePermission {
  READ, WRITE, DELETE, ACL_MANAGEMENT, ALL
}
