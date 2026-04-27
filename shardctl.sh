#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m'
BOLD='\033[1m'

PM2_SITE="shardtown"
PM2_SHARD="shard"
PM2_SHARDGUARD="shardguard"
DIR="/root/shardtown"
SPA_DIR="$DIR/status-app"

clear_screen() { clear; }

status_color() {
    local name=$1
    local status=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
data=json.load(sys.stdin)
for p in data:
    if p['name']=='$name':
        print(p['pm2_env']['status'])
        break
" 2>/dev/null)
    case "$status" in
        online)   echo -e "${GREEN}● online${NC}" ;;
        stopped)  echo -e "${RED}● stopped${NC}" ;;
        errored)  echo -e "${RED}● errored${NC}" ;;
        *)        echo -e "${YELLOW}● $status${NC}" ;;
    esac
}

get_uptime() {
    local name=$1
    pm2 jlist 2>/dev/null | python3 -c "
import sys,json,time
data=json.load(sys.stdin)
for p in data:
    if p['name']=='$name':
        pm2_uptime = p['pm2_env'].get('pm_uptime', 0)
        secs = int((time.time()*1000 - pm2_uptime)/1000)
        if secs < 60: print(f'{secs}s')
        elif secs < 3600: print(f'{secs//60}m {secs%60}s')
        else: print(f'{secs//3600}h {(secs%3600)//60}m')
        break
" 2>/dev/null || echo "-"
}

get_restarts() {
    local name=$1
    pm2 jlist 2>/dev/null | python3 -c "
import sys,json
data=json.load(sys.stdin)
for p in data:
    if p['name']=='$name':
        print(p['pm2_env'].get('restart_time',0))
        break
" 2>/dev/null || echo "0"
}

header() {
    echo -e "${CYAN}${BOLD}"
    echo "  ███████╗██╗  ██╗ █████╗ ██████╗ ██████╗ ████████╗██╗    ██╗███╗   ██╗"
    echo "  ██╔════╝██║  ██║██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██║    ██║████╗  ██║"
    echo "  ███████╗███████║███████║██████╔╝██║  ██║   ██║   ██║ █╗ ██║██╔██╗ ██║"
    echo "  ╚════██║██╔══██║██╔══██║██╔══██╗██║  ██║   ██║   ██║███╗██║██║╚██╗██║"
    echo "  ███████║██║  ██║██║  ██║██║  ██║██████╔╝   ██║   ╚███╔███╔╝██║ ╚████║"
    echo "  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝    ╚═╝    ╚══╝╚══╝ ╚═╝  ╚═══╝"
    echo -e "${NC}"
    echo -e "  ${DIM}Control Panel — $(date '+%d/%m/%Y %H:%M:%S')${NC}"
    echo -e "  ${DIM}─────────────────────────────────────────────────────────────────${NC}"
    echo ""
}

overview() {
    local site_status=$(status_color $PM2_SITE)
    local shard_status=$(status_color $PM2_SHARD)
    local sg_status=$(status_color $PM2_SHARDGUARD)

    echo -e "  ${BOLD}${WHITE}SERVICES${NC}"
    echo -e "  ${DIM}──────────────────────────────────────────────${NC}"
    printf "  %-20s %s  uptime: %s  restarts: %s\n" \
        "${CYAN}Site Web${NC}" "$site_status" "$(get_uptime $PM2_SITE)" "$(get_restarts $PM2_SITE)"
    printf "  %-20s %s  uptime: %s  restarts: %s\n" \
        "${MAGENTA}Shard Bot${NC}" "$shard_status" "$(get_uptime $PM2_SHARD)" "$(get_restarts $PM2_SHARD)"
    printf "  %-20s %s  uptime: %s  restarts: %s\n" \
        "${BLUE}ShardGuard Bot${NC}" "$sg_status" "$(get_uptime $PM2_SHARDGUARD)" "$(get_restarts $PM2_SHARDGUARD)"
    echo ""

    echo -e "  ${BOLD}${WHITE}SYSTÈME${NC}"
    echo -e "  ${DIM}──────────────────────────────────────────────${NC}"
    local mem=$(free -m | awk 'NR==2{printf "%.0f/%.0fMi", $3, $2}')
    local disk=$(df -h / | awk 'NR==2{printf "%s/%s", $3, $2}')
    local load=$(uptime | awk -F'load average:' '{print $2}' | xargs)
    local uptime=$(uptime -p | sed 's/up //')
    echo -e "  Mémoire    : ${GREEN}${mem}${NC}"
    echo -e "  Disque     : ${GREEN}${disk}${NC}"
    echo -e "  Load       : ${GREEN}${load}${NC}"
    echo -e "  Uptime VPS : ${GREEN}${uptime}${NC}"
    echo ""
}

control_service() {
    local name=$1
    local label=$2
    local file=$3

    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}${label}${NC}"
        echo -e "  ${DIM}──────────────────────────────────────────────${NC}"
        echo -e "  Statut : $(status_color $name)"
        echo -e "  Uptime : $(get_uptime $name)   Restarts: $(get_restarts $name)"
        echo ""
        echo -e "  ${YELLOW}[1]${NC} Démarrer"
        echo -e "  ${YELLOW}[2]${NC} Arrêter"
        echo -e "  ${YELLOW}[3]${NC} Redémarrer"
        echo -e "  ${YELLOW}[4]${NC} Logs (50 dernières lignes)"
        echo -e "  ${YELLOW}[5]${NC} Logs en temps réel (Ctrl+C pour quitter)"
        echo -e "  ${YELLOW}[0]${NC} Retour"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice
        case $choice in
            1)
                if pm2 list | grep -q "$name"; then
                    pm2 start $name
                else
                    cd $DIR && pm2 start $file --name $name
                fi
                pm2 save
                echo -e "\n  ${GREEN}✅ $label démarré${NC}"
                sleep 1 ;;
            2)
                pm2 stop $name
                echo -e "\n  ${RED}⏹ $label arrêté${NC}"
                sleep 1 ;;
            3)
                pm2 restart $name
                echo -e "\n  ${YELLOW}🔄 $label redémarré${NC}"
                sleep 1 ;;
            4)
                pm2 logs $name --lines 50 --nostream
                echo -e "\n  ${DIM}Appuyez sur Entrée pour continuer...${NC}"
                read -r ;;
            5)
                pm2 logs $name ;;
            0) break ;;
            *) echo -e "  ${RED}Choix invalide${NC}"; sleep 0.5 ;;
        esac
    done
}

shards_menu() {
    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}SHARDS — Vue globale${NC}"
        echo -e "  ${DIM}──────────────────────────────────────────────${NC}"
        echo ""
        echo -e "  ${CYAN}Shard Bot :${NC} $(status_color $PM2_SHARD)"
        echo -e "  ${BLUE}ShardGuard :${NC} $(status_color $PM2_SHARDGUARD)"
        echo ""
        echo -e "  ${DIM}Les shards sont gérés par les Sharding Managers.${NC}"
        echo -e "  ${DIM}Redémarrer le bot redémarre tous ses shards.${NC}"
        echo ""
        echo -e "  ${YELLOW}[1]${NC} Redémarrer tous les shards Shard Bot"
        echo -e "  ${YELLOW}[2]${NC} Redémarrer tous les shards ShardGuard"
        echo -e "  ${YELLOW}[3]${NC} Redémarrer TOUS les shards (les 2 bots)"
        echo -e "  ${YELLOW}[4]${NC} Arrêter tous les shards"
        echo -e "  ${YELLOW}[5]${NC} Démarrer tous les shards"
        echo -e "  ${YELLOW}[0]${NC} Retour"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice
        case $choice in
            1)
                pm2 restart $PM2_SHARD
                echo -e "\n  ${YELLOW}🔄 Shards Shard Bot redémarrés${NC}"
                sleep 1 ;;
            2)
                pm2 restart $PM2_SHARDGUARD
                echo -e "\n  ${YELLOW}🔄 Shards ShardGuard redémarrés${NC}"
                sleep 1 ;;
            3)
                pm2 restart $PM2_SHARD $PM2_SHARDGUARD
                echo -e "\n  ${YELLOW}🔄 Tous les shards redémarrés${NC}"
                sleep 1 ;;
            4)
                pm2 stop $PM2_SHARD $PM2_SHARDGUARD
                echo -e "\n  ${RED}⏹ Tous les shards arrêtés${NC}"
                sleep 1 ;;
            5)
                pm2 start $PM2_SHARD $PM2_SHARDGUARD
                echo -e "\n  ${GREEN}✅ Tous les shards démarrés${NC}"
                sleep 1 ;;
            0) break ;;
            *) echo -e "  ${RED}Choix invalide${NC}"; sleep 0.5 ;;
        esac
    done
}

deploy_full() {
    echo -e "\n  ${CYAN}🔄 [1/5] Reset des modifs locales du lockfile SPA...${NC}"
    cd "$DIR" || return 1
    git checkout -- status-app/package-lock.json 2>/dev/null

    echo -e "  ${CYAN}🔄 [2/5] git pull...${NC}"
    if ! git pull; then
        echo -e "  ${RED}❌ git pull a échoué${NC}"
        return 1
    fi

    echo -e "  ${CYAN}📦 [3/5] Installation des dépendances racine...${NC}"
    if [ -f "$DIR/package.json" ]; then
        (cd "$DIR" && npm install --no-audit --no-fund) || {
            echo -e "  ${RED}❌ npm install racine a échoué${NC}"; return 1; }
    fi

    echo -e "  ${CYAN}📦 [4/5] Installation des dépendances SPA (status-app)...${NC}"
    if [ -f "$SPA_DIR/package-lock.json" ]; then
        (cd "$SPA_DIR" && npm ci --no-audit --no-fund) || {
            echo -e "  ${YELLOW}⚠ npm ci a échoué, fallback sur npm install...${NC}"
            (cd "$SPA_DIR" && npm install --no-audit --no-fund) || {
                echo -e "  ${RED}❌ npm install SPA a échoué${NC}"; return 1; }
        }
    else
        (cd "$SPA_DIR" && npm install --no-audit --no-fund) || {
            echo -e "  ${RED}❌ npm install SPA a échoué${NC}"; return 1; }
    fi

    echo -e "  ${CYAN}🏗  [5/5] Build de la SPA (vite build)...${NC}"
    if ! (cd "$SPA_DIR" && npm run build); then
        echo -e "  ${RED}❌ Le build de la SPA a échoué — services NON redémarrés${NC}"
        return 1
    fi

    echo -e "  ${CYAN}🔁 Redémarrage de tous les services PM2...${NC}"
    pm2 restart all
    pm2 save

    echo -e "  ${GREEN}✅ Déploiement terminé${NC}"
}

build_spa_only() {
    echo -e "\n  ${CYAN}🏗  Build de la SPA uniquement...${NC}"
    if [ -f "$SPA_DIR/package-lock.json" ]; then
        (cd "$SPA_DIR" && npm ci --no-audit --no-fund) \
            || (cd "$SPA_DIR" && npm install --no-audit --no-fund)
    else
        (cd "$SPA_DIR" && npm install --no-audit --no-fund)
    fi
    if (cd "$SPA_DIR" && npm run build); then
        echo -e "  ${GREEN}✅ SPA buildée${NC}"
        echo -ne "  ${BOLD}Redémarrer le site web maintenant ? (o/N) : ${NC}"
        read -r r
        if [[ "$r" == "o" || "$r" == "O" ]]; then
            pm2 restart $PM2_SITE && pm2 save
            echo -e "  ${GREEN}✅ Site web redémarré${NC}"
        fi
    else
        echo -e "  ${RED}❌ Le build de la SPA a échoué${NC}"
    fi
}

update_menu() {
    while true; do
        clear_screen
        header
        echo -e "  ${BOLD}${WHITE}MISE À JOUR / DÉPLOIEMENT${NC}"
        echo -e "  ${DIM}──────────────────────────────────────────────${NC}"
        echo ""
        echo -e "  ${YELLOW}[1]${NC} 🚀 Déploiement complet (pull + install + build SPA + restart)"
        echo -e "  ${YELLOW}[2]${NC} 🏗  Build SPA uniquement (status-app)"
        echo -e "  ${YELLOW}[3]${NC} ⬇️  git pull seul (sans build ni restart)"
        echo -e "  ${YELLOW}[4]${NC} 📦 npm install racine"
        echo -e "  ${YELLOW}[5]${NC} 📦 npm install / ci dans status-app"
        echo -e "  ${YELLOW}[6]${NC} 🔁 Restart all (sans pull/build)"
        echo -e "  ${YELLOW}[0]${NC} Retour"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice
        case $choice in
            1)
                deploy_full
                echo -e "\n  ${DIM}Appuyez sur Entrée pour continuer...${NC}"
                read -r ;;
            2)
                build_spa_only
                echo -e "\n  ${DIM}Appuyez sur Entrée pour continuer...${NC}"
                read -r ;;
            3)
                echo -e "\n  ${CYAN}🔄 Pull en cours...${NC}"
                (cd "$DIR" && git checkout -- status-app/package-lock.json 2>/dev/null; git pull)
                echo -e "  ${YELLOW}⚠ Rappel : la SPA n'est pas rebuildée. Utilise [1] ou [2] pour appliquer les changements front.${NC}"
                sleep 2 ;;
            4)
                (cd "$DIR" && npm install --no-audit --no-fund)
                echo -e "\n  ${GREEN}✅ npm install racine terminé${NC}"
                sleep 2 ;;
            5)
                if [ -f "$SPA_DIR/package-lock.json" ]; then
                    (cd "$SPA_DIR" && npm ci --no-audit --no-fund) \
                        || (cd "$SPA_DIR" && npm install --no-audit --no-fund)
                else
                    (cd "$SPA_DIR" && npm install --no-audit --no-fund)
                fi
                echo -e "\n  ${GREEN}✅ Dépendances SPA installées${NC}"
                sleep 2 ;;
            6)
                pm2 restart all && pm2 save
                echo -e "\n  ${GREEN}✅ Tous les services redémarrés${NC}"
                sleep 1 ;;
            0) break ;;
            *) echo -e "  ${RED}Choix invalide${NC}"; sleep 0.5 ;;
        esac
    done
}

main_menu() {
    while true; do
        clear_screen
        header
        overview
        echo -e "  ${BOLD}${WHITE}MENU PRINCIPAL${NC}"
        echo -e "  ${DIM}──────────────────────────────────────────────${NC}"
        echo -e "  ${YELLOW}[1]${NC} 🌐  Gérer le Site Web"
        echo -e "  ${YELLOW}[2]${NC} ⚡  Gérer Shard Bot"
        echo -e "  ${YELLOW}[3]${NC} 🛡️   Gérer ShardGuard Bot"
        echo -e "  ${YELLOW}[4]${NC} 🔀  Vue & contrôle des Shards"
        echo -e "  ${YELLOW}[5]${NC} 🔁  Redémarrer TOUT"
        echo -e "  ${YELLOW}[6]${NC} ⏹  Arrêter TOUT"
        echo -e "  ${YELLOW}[7]${NC} ⬆️   Mise à jour (git pull)"
        echo -e "  ${YELLOW}[8]${NC} 📊  pm2 monit (dashboard temps réel)"
        echo -e "  ${YELLOW}[0]${NC} 🚪  Quitter"
        echo ""
        echo -ne "  ${BOLD}Choix : ${NC}"
        read -r choice
        case $choice in
            1) control_service $PM2_SITE "Site Web" "server.js" ;;
            2) control_service $PM2_SHARD "Shard Bot" "Shard/sharder.js" ;;
            3) control_service $PM2_SHARDGUARD "ShardGuard Bot" "ShardGuard/sharder.js" ;;
            4) shards_menu ;;
            5)
                pm2 restart all
                echo -e "\n  ${GREEN}✅ Tous les services redémarrés${NC}"
                sleep 1 ;;
            6)
                echo -ne "\n  ${RED}Confirmer l'arrêt de TOUT ? (o/N) : ${NC}"
                read -r confirm
                if [[ "$confirm" == "o" || "$confirm" == "O" ]]; then
                    pm2 stop all
                    echo -e "  ${RED}⏹ Tous les services arrêtés${NC}"
                    sleep 1
                fi ;;
            7) update_menu ;;
            8) pm2 monit ;;
            0)
                echo -e "\n  ${DIM}À bientôt.${NC}\n"
                exit 0 ;;
            *) echo -e "  ${RED}Choix invalide${NC}"; sleep 0.5 ;;
        esac
    done
}

if ! command -v pm2 &>/dev/null; then
    echo -e "${RED}❌ PM2 n'est pas installé. Lance : npm install -g pm2${NC}"
    exit 1
fi

main_menu
