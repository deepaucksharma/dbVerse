#!/bin/bash
set -eo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

calculate_memory() {
    log "Calculating dynamic memory settings..."
    
    # # Get system memory info
    # local mem_total_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
    # local mem_available_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
    
    # if [ -z "$mem_total_kb" ] || [ "$mem_total_kb" -eq 0 ]; then
    #     log "WARNING: Could not determine system memory, using defaults"
    #     return 0
    # fi
    
    # # Calculate optimal values
    # local shared_buffers_kb=$((mem_total_kb / 4))  # 25% of total memory
    # local effective_cache_size_kb=$((mem_total_kb * 3 / 4))  # 75% of total memory
    # local maintenance_work_mem_kb=$((mem_total_kb / 16))  # 6.25% of total memory
    # local work_mem_kb=$(( (mem_available_kb / 4) / 100 ))  # Divided by max_connections
    
    # # Apply reasonable limits
    # shared_buffers_kb=$(( shared_buffers_kb > 16777216 ? 16777216 : shared_buffers_kb ))  # Max 16GB
    # shared_buffers_kb=$(( shared_buffers_kb < 131072 ? 131072 : shared_buffers_kb ))  # Min 128MB
    
    # work_mem_kb=$(( work_mem_kb > 65536 ? 65536 : work_mem_kb ))  # Max 64MB per connection
    # work_mem_kb=$(( work_mem_kb < 4096 ? 4096 : work_mem_kb ))  # Min 4MB
    
    # maintenance_work_mem_kb=$(( maintenance_work_mem_kb > 2097152 ? 2097152 : maintenance_work_mem_kb ))  # Max 2GB
    # maintenance_work_mem_kb=$(( maintenance_work_mem_kb < 65536 ? 65536 : maintenance_work_mem_kb ))  # Min 64MB
    
    # # Update postgresql.conf
    # local config_file="/etc/postgresql/postgresql.conf"
    
    # if [ ! -f "$config_file" ]; then
    #     log "ERROR: PostgreSQL config file not found at $config_file"
    #     return 1
    # fi
    
    # # Create backup
    # cp "$config_file" "${config_file}.bak"
    
    # # Update memory settings
    # sed -i \
    #     -e "s/^shared_buffers *=.*/shared_buffers = '${shared_buffers_kb}kB'/" \
    #     -e "s/^effective_cache_size *=.*/effective_cache_size = '${effective_cache_size_kb}kB'/" \
    #     -e "s/^maintenance_work_mem *=.*/maintenance_work_mem = '${maintenance_work_mem_kb}kB'/" \
    #     -e "s/^work_mem *=.*/work_mem = '${work_mem_kb}kB'/" \
    #     "$config_file"
    
    # log "Memory settings updated:
    # shared_buffers: ${shared_buffers_kb}kB
    # effective_cache_size: ${effective_cache_size_kb}kB
    # maintenance_work_mem: ${maintenance_work_mem_kb}kB
    # work_mem: ${work_mem_kb}kB"
}

calculate_memory
