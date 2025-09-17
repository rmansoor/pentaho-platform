package org.pentaho.platform.repository2.unified.git.migration;

import org.pentaho.platform.api.repository2.unified.RepositoryFile;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Migration plan that organizes repository items for optimal migration order.
 * 
 * This class ensures:
 * - Folders are created before their contents
 * - Dependencies are resolved in correct order
 * - Progress tracking capabilities
 * 
 * @author Migration Framework
 */
public class MigrationPlan {

  private final List<RepositoryFile> items;
  private int folderCount = 0;
  private int fileCount = 0;

  public MigrationPlan() {
    this.items = new ArrayList<>();
  }

  /**
   * Adds an item to the migration plan.
   * 
   * @param item the repository item to add
   */
  public void addItem(RepositoryFile item) {
    items.add(item);
    if (item.isFolder()) {
      folderCount++;
    } else {
      fileCount++;
    }
  }

  /**
   * Gets all items sorted in optimal migration order.
   * Folders come before files, and items are sorted by path depth.
   * 
   * @return sorted list of items
   */
  public List<RepositoryFile> getSortedItems() {
    List<RepositoryFile> sorted = new ArrayList<>(items);
    
    sorted.sort(new Comparator<RepositoryFile>() {
      @Override
      public int compare(RepositoryFile a, RepositoryFile b) {
        // Folders before files
        if (a.isFolder() && !b.isFolder()) return -1;
        if (!a.isFolder() && b.isFolder()) return 1;
        
        // Sort by path depth (shorter paths first)
        int depthA = getPathDepth(a.getPath());
        int depthB = getPathDepth(b.getPath());
        if (depthA != depthB) {
          return Integer.compare(depthA, depthB);
        }
        
        // Finally by path alphabetically
        return a.getPath().compareTo(b.getPath());
      }
    });
    
    return sorted;
  }

  private int getPathDepth(String path) {
    if (path == null || path.equals("/")) return 0;
    return path.split("/").length - 1;
  }

  public List<RepositoryFile> getItems() {
    return new ArrayList<>(items);
  }

  public int getTotalItems() {
    return items.size();
  }

  public int getFolderCount() {
    return folderCount;
  }

  public int getFileCount() {
    return fileCount;
  }
}
