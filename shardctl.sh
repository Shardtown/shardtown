#!/bin/bash
# =============================================================================
#  shardctl - Panneau de controle de l'infrastructure Shardtown
# =============================================================================
#  Gere les services PM2 :
#    - shardtown      : Site web                 (server.js)
#    - shard          : Shard Bot                (Shard/sharder.js)
#    - shardguard     : ShardGuard Bot           (ShardGuard/sharder.js)
#    - paladium       : Paladium Com Portal      (dist/index.js)
# =============================================================================

# -------- Couleurs ----------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# -------- Identifiants des process PM2 --------------------------------------
PM2_SITE="shardtown"
PM2_SHARD="shard"
PM2_SHARDGUARD="shardguard"
PM2_PALADIUM="paladium"

# -------- Dossiers de travail ------------------------------------------------
DIR_SITE="/root/shardtown"
DIR_SHARD="/root/shardtown"
DIR_SHARDGUARD="/root/shardtown"
DIR_PALADIUM="/root/PaladiumComPortal"
DIR="/root/shardtown"  # alias historique

# -------- Points d'entree (relatifs au dossier de travail) -------------------
FILE_SITE="server.js"
FILE_SHARD="Shard/sharder.js"
FILE_SHARDGUARD="ShardGuard/sharder.js"
FILE_PALADIUM="dist/index.js"

# =============================================================================
#  UTILITAIRES
# =============================================================================

clear_screen() { clear; }

pause() {
    echo -e "\n  ${DIM}Appuyez sur Entree pour continuer...${NC}"
    read -r
}

confirm() {
    local prompt=$1
    echo -ne "\n  ${YELLOW}${prompt} (o/N) : ${NC}"
    read -r answer
    [[ "$answer" == "o" || "$answer" == "O" ]]
}

# Recupere un champ JSON d'un process PM2 par son nom
pm2_field() {
    local name=$1
    local path=$2
    pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        if p.get('name') == '$name':
            cur = p
            for key in '$path'.split('.'):
                if isinstance(cur, dict):
                    cur = cur.get(key)
                else:
                    cur = None
                    break
            print(cur if cur is not None else '-')
            sys.exit(0)
    print('-')
except Exception:
    print('-')
" 2>/dev/null
}

status_text() {
    local name=$1
    local status=$(pm2_field "$name" "pm2_env.status")
    case "$status" in
        online)     echo -e "${GREEN}[ ONLINE  ]${NC}" ;;
        stopped)    echo -e "${RED}[ STOPPED ]${NC}" ;;
        errored)    echo -e "${RED}[ ERRORED ]${NC}" ;;
        launching)  echo -e "${YELLOW}[ LAUNCH  ]${NC}" ;;
        stopping)   echo -e "${YELLOW}[ STOPPING]${NC}" ;;
        -)          echo -e "${DIM}[  ABSENT ]${NC}" ;;
        *)          echo -e "${YELLOW}[ ${status} ]${NC}" ;;
    esac
}

get_uptime() {
    local name=$1
    pm2 jlist 2>/dev/null | python3 -c "
import sys, json, time
try:
    data = json.load(sys.stdin)
    for p in data:
        if p.get('name') == '$name':
            ts = p.get('pm2_env', {}).get('pm_uptime', 0)
            status = p.get('pm2_env', {}).get('status')
            if status != 'online' or ts == 0:
                print('-')
                break
            secs = int((time.time() * 1000 - ts) / 1000)
            if secs < 60:    print(f'{secs}s')
            elif secs < 3600: print(f'{secs//60}m {secs%60}s')
            elif secs < 86400: print(f'{secs//3600}h {(secs%3600)//60}m')
            else: print(f'{secs//86400}j {(secs%86400)//3600}h')
            break
    else:
        print('-')
except Exception:
    print('-')
" 2>/dev/null
}

get_restarts() { pm2_field "$1" "pm2_env.restart_time"; }
get_pid()      { pm2_field "$1" "pid"; }
get_cpu()      { pm2_field "$1" "monit.cpu"; }

get_mem_mb() {
    local name=$1
    pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        if p.get('name') == '$name':
            mem = p.get('monit', {}).get('memory', 0)
            print(f'{mem/1024/1024:.1f}' if mem else '-')
            break
    else:
        print('-')
except Exception:
    print('-')
" 2>/dev/null
}

# =============================================================================
#  AFFICHAGE
# =============================================================================

header() {
    echo -e "${CYAN}${BOLD}"
    echo "  ==============================================================================="
    echo "                              S H A R D C T L"
    echo "                  Panneau de controle Shardtown / Paladium"
    echo "  ==============================================================================="
    echo -e "${NC}"
    echo -e "  ${DIM}Date    : $(date '+%A %d %B %Y - %H:%M:%S')${NC}"
    echo -e "  ${DIM}Hote    : $(hostname)${NC}"
    echo -e "  ${DIM}User    : $(whoami)${NC}"
    echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
    echo ""
}

# Une ligne de service detaillee
print_service_line() {
    local label=$1
    local color=$2
    local name=$3

    local status=$(status_text "$name")
    local up=$(get_uptime "$name")
    local rs=$(get_restarts "$name")
    local pid=$(get_pid "$name")
    local cpu=$(get_cpu "$name")
    local mem=$(get_mem_mb "$name")

    printf "  ${color}%-18s${NC} %s  pid:%-7s cpu:%-4s%%  mem:%-7sMo  up:%-10s rs:%s\n" \
        "$label" "$status" "$pid" "$cpu" "$mem" "$up" "$rs"
}

overview() {
    echo -e "  ${BOLD}${WHITE}SERVICES${NC}"
    echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
    print_service_line "Site Web"        "$CYAN"    "$PM2_SITE"
    print_service_line "Shard Bot"       "$MAGENTA" "$PM2_SHARD"
    print_service_line "ShardGuard Bot"  "$BLUE"    "$PM2_SHARDGUARD"
    print_service_line "Paladium Portal" "$YELLOW"  "$PM2_PALADIUM"
    echo ""

    echo -e "  ${BOLD}${WHITE}SYSTEME${NC}"
    echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
    local mem=$(free -m | awk 'NR==2{printf "%d Mo / %d Mo (%.1f%%)", $3, $2, $3*100/$2}')
    local disk=$(df -h / | awk 'NR==2{printf "%s / %s (%s)", $3, $2, $5}')
    local load=$(uptime | awk -F'load average:' '{print $2}' | xargs)
    local upvps=$(uptime -p | sed 's/up //')
    local kernel=$(uname -r)
    local nodev=$(node -v 2>/dev/null || echo "non installe")
    local pm2v=$(pm2 -v 2>/dev/null || echo "non installe")

    printf "  %-15s %s\n" "Memoire RAM"   "${GREEN}${mem}${NC}"
    printf "  %-15s %s\n" "Disque"        "${GREEN}${disk}${NC}"
    printf "  %-15s %s\n" "Load average"  "${GREEN}${load}${NC}"
    printf "  %-15s %s\n" "Uptime VPS"    "${GREEN}${upvps}${NC}"
    printf "  %-15s %s\n" "Kernel"        "${DIM}${kernel}${NC}"
    printf "  %-15s %s\n" "Node.js"       "${DIM}${nodev}${NC}"
    printf "  %-15s %s\n" "PM2"           "${DIM}${pm2v}${NC}"
    echo ""
}

# =============================================================================
#  GESTION D'UN SERVICE GENERIQUE
# =============================================================================

control_service() {
    local name=$1     # nom PM2
    local label=$2    # libelle d'affichage
    local file=$3     # script a lancer
    local dir=$4      # dossier de travail

    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}GESTION DU SERVICE : ${label}${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo ""
        echo -e "  Nom PM2     : ${CYAN}${name}${NC}"
        echo -e "  Dossier     : ${CYAN}${dir}${NC}"
        echo -e "  Script      : ${CYAN}${file}${NC}"
        echo -e "  Statut      : $(status_text $name)"
        echo -e "  PID         : $(get_pid $name)"
        echo -e "  CPU         : $(get_cpu $name) %"
        echo -e "  Memoire     : $(get_mem_mb $name) Mo"
        echo -e "  Uptime      : $(get_uptime $name)"
        echo -e "  Redemarrages: $(get_restarts $name)"
        echo ""
        echo -e "  ${BOLD}ACTIONS${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo -e "  ${YELLOW}[1]${NC} Demarrer le service"
        echo -e "  ${YELLOW}[2]${NC} Arreter le service"
        echo -e "  ${YELLOW}[3]${NC} Redemarrer le service"
        echo -e "  ${YELLOW}[4]${NC} Recharger en zero-downtime (reload)"
        echo -e "  ${YELLOW}[5]${NC} Supprimer le service de PM2 (delete)"
        echo ""
        echo -e "  ${BOLD}LOGS${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo -e "  ${YELLOW}[6]${NC} Afficher les 50 dernieres lignes"
        echo -e "  ${YELLOW}[7]${NC} Afficher les 200 dernieres lignes"
        echo -e "  ${YELLOW}[8]${NC} Suivre les logs en temps reel (Ctrl+C pour quitter)"
        echo -e "  ${YELLOW}[9]${NC} Vider les fichiers de logs (flush)"
        echo ""
        echo -e "  ${BOLD}AVANCE${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo -e "  ${YELLOW}[i]${NC} pm2 describe ${name}"
        echo -e "  ${YELLOW}[e]${NC} Editer le fichier .env du projet"
        echo -e "  ${YELLOW}[s]${NC} Ouvrir un shell dans ${dir}"
        echo ""
        echo -e "  ${YELLOW}[0]${NC} Retour au menu principal"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice

        case $choice in
            1)
                if pm2 list 2>/dev/null | grep -q " $name "; then
                    pm2 start "$name"
                else
                    if [[ ! -d "$dir" ]]; then
                        echo -e "\n  ${RED}Erreur : le dossier ${dir} n'existe pas.${NC}"
                        pause; continue
                    fi
                    if [[ ! -f "${dir}/${file}" ]]; then
                        echo -e "\n  ${RED}Erreur : le fichier ${dir}/${file} est introuvable.${NC}"
                        echo -e "  ${DIM}As-tu lance 'npm run build' pour compiler le projet ?${NC}"
                        pause; continue
                    fi
                    cd "$dir" && pm2 start "$file" --name "$name"
                fi
                pm2 save >/dev/null 2>&1
                echo -e "\n  ${GREEN}>> ${label} demarre.${NC}"
                sleep 1 ;;
            2)
                pm2 stop "$name"
                echo -e "\n  ${RED}>> ${label} arrete.${NC}"
                sleep 1 ;;
            3)
                pm2 restart "$name"
                echo -e "\n  ${YELLOW}>> ${label} redemarre.${NC}"
                sleep 1 ;;
            4)
                pm2 reload "$name"
                echo -e "\n  ${YELLOW}>> ${label} recharge (zero-downtime).${NC}"
                sleep 1 ;;
            5)
                if confirm "Supprimer le service ${label} de PM2 ?"; then
                    pm2 delete "$name"
                    pm2 save >/dev/null 2>&1
                    echo -e "\n  ${RED}>> ${label} supprime de PM2.${NC}"
                    sleep 1
                fi ;;
            6)
                pm2 logs "$name" --lines 50 --nostream
                pause ;;
            7)
                pm2 logs "$name" --lines 200 --nostream
                pause ;;
            8)
                pm2 logs "$name" ;;
            9)
                if confirm "Vider tous les logs de ${label} ?"; then
                    pm2 flush "$name"
                    echo -e "\n  ${GREEN}>> Logs vides.${NC}"
                    sleep 1
                fi ;;
            i|I)
                pm2 describe "$name"
                pause ;;
            e|E)
                if [[ -f "${dir}/.env" ]]; then
                    ${EDITOR:-nano} "${dir}/.env"
                else
                    if confirm "Aucun .env trouve dans ${dir}. En creer un ?"; then
                        ${EDITOR:-nano} "${dir}/.env"
                    fi
                fi ;;
            s|S)
                echo -e "\n  ${CYAN}Shell dans ${dir} - tapez 'exit' pour revenir.${NC}"
                (cd "$dir" && ${SHELL:-bash}) ;;
            0)
                break ;;
            *)
                echo -e "\n  ${RED}Choix invalide.${NC}"; sleep 0.7 ;;
        esac
    done
}

# =============================================================================
#  MENU SPECIFIQUE PALADIUM (auth, build, reset)
# =============================================================================

paladium_advanced_menu() {
    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}PALADIUM PORTAL - OPERATIONS AVANCEES${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo ""
        echo -e "  Dossier : ${CYAN}${DIR_PALADIUM}${NC}"
        echo -e "  Statut  : $(status_text $PM2_PALADIUM)"
        echo ""
        echo -e "  ${YELLOW}[1]${NC} npm install (installer les dependances)"
        echo -e "  ${YELLOW}[2]${NC} npm run build (compiler le TypeScript)"
        echo -e "  ${YELLOW}[3]${NC} Lancer en foreground pour authentification Microsoft"
        echo -e "      ${DIM}(necessaire au premier lancement, code Microsoft a coller)${NC}"
        echo -e "  ${YELLOW}[4]${NC} npm run reset (reinitialiser l'authentification)"
        echo -e "  ${YELLOW}[5]${NC} Nettoyage complet (rm node_modules + reinstall + rebuild)"
        echo -e "  ${YELLOW}[6]${NC} Voir le contenu du dossier auth/"
        echo -e "  ${YELLOW}[0]${NC} Retour"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice

        case $choice in
            1)
                echo -e "\n  ${CYAN}>> npm install dans ${DIR_PALADIUM}...${NC}"
                (cd "$DIR_PALADIUM" && npm install)
                pause ;;
            2)
                echo -e "\n  ${CYAN}>> npm run build dans ${DIR_PALADIUM}...${NC}"
                (cd "$DIR_PALADIUM" && npm run build)
                pause ;;
            3)
                echo -e "\n  ${YELLOW}>> Lancement en foreground.${NC}"
                echo -e "  ${DIM}Copie le code Microsoft affiche, valide-le sur https://microsoft.com/link${NC}"
                echo -e "  ${DIM}Une fois le bot connecte, fais Ctrl+C pour quitter.${NC}\n"
                (cd "$DIR_PALADIUM" && node "$FILE_PALADIUM")
                pause ;;
            4)
                if confirm "Reinitialiser l'authentification Paladium ?"; then
                    (cd "$DIR_PALADIUM" && npm run reset)
                    pause
                fi ;;
            5)
                if confirm "Supprimer node_modules + reinstaller + rebuild ?"; then
                    (cd "$DIR_PALADIUM" && rm -rf node_modules package-lock.json && npm install && npm run build)
                    pause
                fi ;;
            6)
                if [[ -d "${DIR_PALADIUM}/auth" ]]; then
                    ls -la "${DIR_PALADIUM}/auth"
                else
                    echo -e "\n  ${YELLOW}Dossier auth/ inexistant - aucune session enregistree.${NC}"
                fi
                pause ;;
            0) break ;;
            *) echo -e "\n  ${RED}Choix invalide.${NC}"; sleep 0.7 ;;
        esac
    done
}

# =============================================================================
#  MENU SHARDS
# =============================================================================

shards_menu() {
    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}SHARDS - VUE GLOBALE${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo ""
        print_service_line "Shard Bot"      "$MAGENTA" "$PM2_SHARD"
        print_service_line "ShardGuard Bot" "$BLUE"    "$PM2_SHARDGUARD"
        echo ""
        echo -e "  ${DIM}Les shards sont geres par les Sharding Managers.${NC}"
        echo -e "  ${DIM}Redemarrer le bot redemarre tous ses shards.${NC}"
        echo ""
        echo -e "  ${YELLOW}[1]${NC} Redemarrer tous les shards Shard Bot"
        echo -e "  ${YELLOW}[2]${NC} Redemarrer tous les shards ShardGuard"
        echo -e "  ${YELLOW}[3]${NC} Redemarrer TOUS les shards (les 2 bots)"
        echo -e "  ${YELLOW}[4]${NC} Arreter tous les shards"
        echo -e "  ${YELLOW}[5]${NC} Demarrer tous les shards"
        echo -e "  ${YELLOW}[0]${NC} Retour"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice

        case $choice in
            1) pm2 restart "$PM2_SHARD"; echo -e "\n  ${YELLOW}>> Shards Shard Bot redemarres.${NC}"; sleep 1 ;;
            2) pm2 restart "$PM2_SHARDGUARD"; echo -e "\n  ${YELLOW}>> Shards ShardGuard redemarres.${NC}"; sleep 1 ;;
            3) pm2 restart "$PM2_SHARD" "$PM2_SHARDGUARD"; echo -e "\n  ${YELLOW}>> Tous les shards redemarres.${NC}"; sleep 1 ;;
            4) pm2 stop "$PM2_SHARD" "$PM2_SHARDGUARD"; echo -e "\n  ${RED}>> Tous les shards arretes.${NC}"; sleep 1 ;;
            5) pm2 start "$PM2_SHARD" "$PM2_SHARDGUARD"; echo -e "\n  ${GREEN}>> Tous les shards demarres.${NC}"; sleep 1 ;;
            0) break ;;
            *) echo -e "\n  ${RED}Choix invalide.${NC}"; sleep 0.7 ;;
        esac
    done
}

# =============================================================================
#  MENU MISE A JOUR
# =============================================================================

update_menu() {
    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}MISE A JOUR${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo ""
        echo -e "  ${YELLOW}[1]${NC} Deploiement complet Shardtown"
        echo -e "      ${DIM}git pull + npm install + build SPA + restart all${NC}"
        echo -e "  ${YELLOW}[2]${NC} git pull + restart all (sans rebuild SPA)"
        echo -e "  ${YELLOW}[3]${NC} npm install dans ${DIR_SITE}"
        echo -e "  ${YELLOW}[4]${NC} npm install + build de la SPA (status-app)"
        echo -e "  ${YELLOW}[5]${NC} git pull dans ${DIR_PALADIUM} + rebuild + redemarrer paladium"
        echo -e "  ${YELLOW}[6]${NC} npm install dans ${DIR_PALADIUM}"
        echo -e "  ${YELLOW}[7]${NC} npm run build dans ${DIR_PALADIUM}"
        echo -e "  ${YELLOW}[0]${NC} Retour"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice

        case $choice in
            1)
                echo -e "\n  ${CYAN}>> Deploiement complet Shardtown${NC}"
                (cd "$DIR_SITE" && git checkout -- status-app/package-lock.json 2>/dev/null; git pull) || { pause; continue; }
                (cd "$DIR_SITE" && npm install --no-audit --no-fund) || { pause; continue; }
                if [[ -d "$DIR_SITE/status-app" ]]; then
                    (cd "$DIR_SITE/status-app" && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) && npm run build) || { pause; continue; }
                fi
                pm2 restart all
                pm2 save >/dev/null 2>&1
                echo -e "\n  ${GREEN}>> Deploiement termine.${NC}"
                pause ;;
            2)
                echo -e "\n  ${CYAN}>> git pull dans ${DIR_SITE}...${NC}"
                (cd "$DIR_SITE" && git pull)
                echo -e "\n  ${CYAN}>> Redemarrage de tous les services PM2...${NC}"
                pm2 restart all
                pm2 save >/dev/null 2>&1
                echo -e "\n  ${GREEN}>> Mise a jour terminee.${NC}"
                pause ;;
            3)
                (cd "$DIR_SITE" && npm install --no-audit --no-fund)
                pause ;;
            4)
                if [[ -d "$DIR_SITE/status-app" ]]; then
                    (cd "$DIR_SITE/status-app" && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) && npm run build)
                else
                    echo -e "\n  ${RED}status-app/ introuvable.${NC}"
                fi
                pause ;;
            5)
                echo -e "\n  ${CYAN}>> git pull dans ${DIR_PALADIUM}...${NC}"
                (cd "$DIR_PALADIUM" && git pull && npm install && npm run build)
                pm2 restart "$PM2_PALADIUM" 2>/dev/null
                pm2 save >/dev/null 2>&1
                echo -e "\n  ${GREEN}>> Paladium mis a jour et redemarre.${NC}"
                pause ;;
            6)
                (cd "$DIR_PALADIUM" && npm install)
                pause ;;
            7)
                (cd "$DIR_PALADIUM" && npm run build)
                pause ;;
            0) break ;;
            *) echo -e "\n  ${RED}Choix invalide.${NC}"; sleep 0.7 ;;
        esac
    done
}

# =============================================================================
#  MENU PRINCIPAL
# =============================================================================

main_menu() {
    while true; do
        clear_screen
        header
        overview
        echo -e "  ${BOLD}${WHITE}MENU PRINCIPAL${NC}"
        echo -e "  ${DIM}-------------------------------------------------------------------------------${NC}"
        echo ""
        echo -e "  ${BOLD}Services${NC}"
        echo -e "  ${YELLOW}[1]${NC}  Gerer le Site Web (${PM2_SITE})"
        echo -e "  ${YELLOW}[2]${NC}  Gerer Shard Bot (${PM2_SHARD})"
        echo -e "  ${YELLOW}[3]${NC}  Gerer ShardGuard Bot (${PM2_SHARDGUARD})"
        echo -e "  ${YELLOW}[4]${NC}  Gerer Paladium Portal (${PM2_PALADIUM})"
        echo ""
        echo -e "  ${BOLD}Actions globales${NC}"
        echo -e "  ${YELLOW}[5]${NC}  Vue & controle des Shards"
        echo -e "  ${YELLOW}[6]${NC}  Redemarrer TOUS les services PM2"
        echo -e "  ${YELLOW}[7]${NC}  Arreter TOUS les services PM2"
        echo -e "  ${YELLOW}[8]${NC}  Demarrer TOUS les services PM2"
        echo ""
        echo -e "  ${BOLD}Outils${NC}"
        echo -e "  ${YELLOW}[u]${NC}  Mise a jour (git pull / npm install / build SPA)"
        echo -e "  ${YELLOW}[m]${NC}  pm2 monit (dashboard temps reel)"
        echo -e "  ${YELLOW}[l]${NC}  pm2 list (liste detaillee)"
        echo -e "  ${YELLOW}[s]${NC}  pm2 save (sauvegarder l'etat actuel)"
        echo -e "  ${YELLOW}[r]${NC}  pm2 resurrect (restaurer l'etat sauvegarde)"
        echo -e "  ${YELLOW}[a]${NC}  Operations avancees Paladium (auth/build/reset)"
        echo -e "  ${YELLOW}[0]${NC}  Quitter"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice

        case $choice in
            1) control_service "$PM2_SITE"          "Site Web"               "$FILE_SITE"          "$DIR_SITE" ;;
            2) control_service "$PM2_SHARD"         "Shard Bot"              "$FILE_SHARD"         "$DIR_SHARD" ;;
            3) control_service "$PM2_SHARDGUARD"    "ShardGuard Bot"         "$FILE_SHARDGUARD"    "$DIR_SHARDGUARD" ;;
            4) control_service "$PM2_PALADIUM"      "Paladium Portal"        "$FILE_PALADIUM"      "$DIR_PALADIUM" ;;
            5) shards_menu ;;
            6)
                if confirm "Redemarrer TOUS les services PM2 ?"; then
                    pm2 restart all
                    echo -e "\n  ${GREEN}>> Tous les services redemarres.${NC}"
                    sleep 1
                fi ;;
            7)
                if confirm "Arreter TOUS les services PM2 ?"; then
                    pm2 stop all
                    echo -e "\n  ${RED}>> Tous les services arretes.${NC}"
                    sleep 1
                fi ;;
            8)
                if confirm "Demarrer TOUS les services PM2 ?"; then
                    pm2 start all
                    echo -e "\n  ${GREEN}>> Tous les services demarres.${NC}"
                    sleep 1
                fi ;;
            u|U) update_menu ;;
            m|M) pm2 monit ;;
            l|L) pm2 list; pause ;;
            s|S)
                pm2 save
                echo -e "\n  ${GREEN}>> Etat PM2 sauvegarde.${NC}"
                sleep 1 ;;
            r|R)
                pm2 resurrect
                echo -e "\n  ${GREEN}>> Etat PM2 restaure.${NC}"
                sleep 1 ;;
            a|A) paladium_advanced_menu ;;
            0)
                echo -e "\n  ${DIM}Fermeture de shardctl. A bientot.${NC}\n"
                exit 0 ;;
            *) echo -e "\n  ${RED}Choix invalide.${NC}"; sleep 0.7 ;;
        esac
    done
}

# =============================================================================
#  PRE-FLIGHT CHECKS
# =============================================================================

if ! command -v pm2 &>/dev/null; then
    echo -e "${RED}ERREUR : PM2 n'est pas installe.${NC}"
    echo -e "Installation : ${CYAN}npm install -g pm2${NC}"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo -e "${RED}ERREUR : python3 n'est pas installe (requis pour parser le JSON PM2).${NC}"
    echo -e "Installation : ${CYAN}apt install -y python3${NC}"
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo -e "${YELLOW}ATTENTION : Node.js n'est pas installe ou pas dans le PATH.${NC}"
fi

main_menu
