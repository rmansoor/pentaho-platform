package org.pentaho.platform.repository2.unified.git.migration;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Statistics tracking for repository migration operations.
 * 
 * @author Migration Framework
 */
public class MigrationStatistics {

  private final AtomicInteger processedItems = new AtomicInteger(0);
  private final AtomicInteger folders = new AtomicInteger(0);
  private final AtomicInteger files = new AtomicInteger(0);
  private final AtomicInteger acls = new AtomicInteger(0);
  private final AtomicInteger metadata = new AtomicInteger(0);
  private final AtomicInteger versions = new AtomicInteger(0);
  
  private final AtomicInteger errors = new AtomicInteger(0);
  private final AtomicInteger aclErrors = new AtomicInteger(0);
  private final AtomicInteger metadataErrors = new AtomicInteger(0);
  private final AtomicInteger versionErrors = new AtomicInteger(0);
  
  private final AtomicLong totalDataSize = new AtomicLong(0);
  private final AtomicLong startTime = new AtomicLong(0);
  private final AtomicLong endTime = new AtomicLong(0);

  public MigrationStatistics() {
    reset();
  }

  public void reset() {
    processedItems.set(0);
    folders.set(0);
    files.set(0);
    acls.set(0);
    metadata.set(0);
    versions.set(0);
    errors.set(0);
    aclErrors.set(0);
    metadataErrors.set(0);
    versionErrors.set(0);
    totalDataSize.set(0);
    startTime.set(System.currentTimeMillis());
    endTime.set(0);
  }

  public void markCompleted() {
    endTime.set(System.currentTimeMillis());
  }

  // Increment methods
  public void incrementProcessed() { processedItems.incrementAndGet(); }
  public void incrementFolders() { folders.incrementAndGet(); }
  public void incrementFiles() { files.incrementAndGet(); }
  public void incrementAcls() { acls.incrementAndGet(); }
  public void incrementMetadata() { metadata.incrementAndGet(); }
  public void addVersions(int count) { versions.addAndGet(count); }
  
  public void incrementErrors() { errors.incrementAndGet(); }
  public void incrementAclErrors() { aclErrors.incrementAndGet(); }
  public void incrementMetadataErrors() { metadataErrors.incrementAndGet(); }
  public void incrementVersionErrors() { versionErrors.incrementAndGet(); }
  
  public void addDataSize(long size) { totalDataSize.addAndGet(size); }

  // Getter methods
  public int getProcessedItems() { return processedItems.get(); }
  public int getFolders() { return folders.get(); }
  public int getFiles() { return files.get(); }
  public int getAcls() { return acls.get(); }
  public int getMetadata() { return metadata.get(); }
  public int getVersions() { return versions.get(); }
  
  public int getErrors() { return errors.get(); }
  public int getAclErrors() { return aclErrors.get(); }
  public int getMetadataErrors() { return metadataErrors.get(); }
  public int getVersionErrors() { return versionErrors.get(); }
  public int getTotalErrors() { 
    return errors.get() + aclErrors.get() + metadataErrors.get() + versionErrors.get(); 
  }
  
  public long getTotalDataSize() { return totalDataSize.get(); }
  public long getStartTime() { return startTime.get(); }
  public long getEndTime() { return endTime.get(); }
  
  public long getDurationMillis() {
    long end = endTime.get();
    if (end == 0) end = System.currentTimeMillis();
    return end - startTime.get();
  }

  public double getItemsPerSecond() {
    long duration = getDurationMillis();
    if (duration == 0) return 0;
    return (double) processedItems.get() / (duration / 1000.0);
  }

  public String getFormattedDataSize() {
    long bytes = totalDataSize.get();
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
    if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
    return String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
  }

  public String getFormattedDuration() {
    long millis = getDurationMillis();
    long seconds = millis / 1000;
    long minutes = seconds / 60;
    long hours = minutes / 60;
    
    if (hours > 0) {
      return String.format("%d:%02d:%02d", hours, minutes % 60, seconds % 60);
    } else if (minutes > 0) {
      return String.format("%d:%02d", minutes, seconds % 60);
    } else {
      return String.format("%.1f sec", millis / 1000.0);
    }
  }

  public MigrationStatistics copy() {
    MigrationStatistics copy = new MigrationStatistics();
    copy.processedItems.set(this.processedItems.get());
    copy.folders.set(this.folders.get());
    copy.files.set(this.files.get());
    copy.acls.set(this.acls.get());
    copy.metadata.set(this.metadata.get());
    copy.versions.set(this.versions.get());
    copy.errors.set(this.errors.get());
    copy.aclErrors.set(this.aclErrors.get());
    copy.metadataErrors.set(this.metadataErrors.get());
    copy.versionErrors.set(this.versionErrors.get());
    copy.totalDataSize.set(this.totalDataSize.get());
    copy.startTime.set(this.startTime.get());
    copy.endTime.set(this.endTime.get());
    return copy;
  }

  @Override
  public String toString() {
    return String.format(
        "MigrationStatistics{processed=%d, folders=%d, files=%d, acls=%d, metadata=%d, " +
        "versions=%d, errors=%d, dataSize=%s, duration=%s, rate=%.1f items/sec}",
        processedItems.get(), folders.get(), files.get(), acls.get(), metadata.get(),
        versions.get(), getTotalErrors(), getFormattedDataSize(), getFormattedDuration(),
        getItemsPerSecond()
    );
  }
}
